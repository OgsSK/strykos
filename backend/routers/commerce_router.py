import os
import stripe
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db, AsyncSessionLocal
from models import Product, ProductVariant, Order, Payment, WishlistItem, PromoCode
from auth import get_current_user, get_optional_user
from utils import (
    get_rates, get_settings, product_prices, convert_from_eur, round_currency,
    serialize_product, gen_order_number, STRIPE_SUPPORTED, resolve_media,
)
from emails import send_order_email, notify_admin_new_order

router = APIRouter(tags=["commerce"])
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")


# ---------- Promo codes ----------
async def resolve_promo(db, code: str | None, subtotal_eur: float, email: str | None, user):
    """Returns (promo, error_key). error_key None when valid."""
    if not code:
        return None, None
    res = await db.execute(select(PromoCode).where(func.upper(PromoCode.code) == code.strip().upper()))
    promo = res.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if not promo or not promo.active:
        return None, "promo_invalid"
    if promo.starts_at and promo.starts_at > now:
        return None, "promo_not_started"
    if promo.expires_at and promo.expires_at < now:
        return None, "promo_expired"
    if promo.usage_limit is not None and (promo.used_count or 0) >= promo.usage_limit:
        return None, "promo_exhausted"
    if float(promo.min_subtotal_eur or 0) > subtotal_eur + 1e-9:
        return None, "promo_min_subtotal"
    if promo.first_order_only:
        conds = [Order.payment_status == "paid"]
        if user:
            conds.append(Order.user_id == user.id)
        elif email:
            conds.append(Order.email == email.lower().strip())
        else:
            return None, "promo_first_order_only"
        prev = await db.execute(select(func.count(Order.id)).where(*conds))
        if (prev.scalar() or 0) > 0:
            return None, "promo_first_order_only"
    return promo, None


def promo_discount_eur(promo, subtotal_eur: float) -> float:
    if not promo:
        return 0.0
    if promo.discount_type == "percent":
        return round(subtotal_eur * float(promo.value or 0) / 100.0, 2)
    return round(min(float(promo.value or 0), subtotal_eur), 2)


# ---------- Wishlist ----------
@router.get("/wishlist")
async def get_wishlist(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rates = await get_rates(db)
    result = await db.execute(select(WishlistItem).where(WishlistItem.user_id == user.id))
    ids = [w.product_id for w in result.scalars().all()]
    if not ids:
        return {"product_ids": [], "products": []}
    pq = (
        select(Product).where(Product.id.in_(ids), Product.published == True)
        .options(selectinload(Product.brand), selectinload(Product.category),
                 selectinload(Product.images), selectinload(Product.variants))
    )
    pr = await db.execute(pq)
    products = pr.scalars().unique().all()
    return {"product_ids": ids, "products": [serialize_product(p, rates) for p in products]}


class WishlistInput(BaseModel):
    product_id: str


@router.post("/wishlist")
async def add_wishlist(data: WishlistInput, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    exists = await db.execute(select(WishlistItem).where(
        WishlistItem.user_id == user.id, WishlistItem.product_id == data.product_id))
    if not exists.scalar_one_or_none():
        db.add(WishlistItem(user_id=user.id, product_id=data.product_id))
        await db.commit()
    return {"ok": True}


@router.delete("/wishlist/{product_id}")
async def remove_wishlist(product_id: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(WishlistItem).where(
        WishlistItem.user_id == user.id, WishlistItem.product_id == product_id))
    item = result.scalar_one_or_none()
    if item:
        await db.delete(item)
        await db.commit()
    return {"ok": True}


# ---------- Cart validation / checkout ----------
class CartLine(BaseModel):
    product_id: str
    variant_id: str
    quantity: int
    customization: Optional[dict] = None


class ShippingInfo(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: str
    country: str
    city: str
    address_line: str
    postal_code: str = ""


class CheckoutInput(BaseModel):
    items: list[CartLine]
    currency: str = "EUR"
    shipping: ShippingInfo
    shipping_method_index: int = 0
    origin_url: str
    promo_code: Optional[str] = None
    lang: str = "fr"


async def _compute_order(db, items, currency, shipping_country, shipping_method_index, promo_code=None, email=None, user=None):
    rates = await get_rates(db)
    settings = await get_settings(db)
    charge_currency = currency if currency in STRIPE_SUPPORTED else "EUR"
    order_items, issues = [], []
    subtotal_display = 0.0
    subtotal_charge = 0.0
    subtotal_eur = 0.0
    stripe_line_items = []
    variant_map = {}

    for line in items:
        pr = await db.execute(
            select(Product).where(Product.id == line.product_id, Product.published == True)
            .options(selectinload(Product.images), selectinload(Product.variants))
        )
        product = pr.scalars().unique().one_or_none()
        if not product:
            issues.append({"product_id": line.product_id, "reason": "unavailable"})
            continue
        variant = next((v for v in product.variants if v.id == line.variant_id), None)
        if not variant:
            issues.append({"product_id": line.product_id, "reason": "variant_unavailable"})
            continue
        if line.quantity < 1:
            continue
        if variant.stock < line.quantity:
            issues.append({"product_id": line.product_id, "variant_id": variant.id,
                           "reason": "insufficient_stock", "available": variant.stock})
            continue

        has_custom = bool(line.customization) and product.customizable
        pp = product_prices(product, rates)
        extra_disp = convert_from_eur(variant.extra_price_eur, currency, rates) or 0
        custom_disp = convert_from_eur(product.customization_price_eur, currency, rates) if has_custom else 0
        unit_display = round_currency(pp[currency]["price"] + extra_disp + (custom_disp or 0), currency)
        line_display = round_currency(unit_display * line.quantity, currency)
        subtotal_display += line_display

        extra_chg = convert_from_eur(variant.extra_price_eur, charge_currency, rates) or 0
        custom_chg = convert_from_eur(product.customization_price_eur, charge_currency, rates) if has_custom else 0
        unit_charge = round_currency(pp[charge_currency]["price"] + extra_chg + (custom_chg or 0), charge_currency)
        subtotal_charge += round_currency(unit_charge * line.quantity, charge_currency)
        subtotal_eur += (pp["EUR"]["price"] + float(variant.extra_price_eur or 0)
                         + (float(product.customization_price_eur or 0) if has_custom else 0)) * line.quantity

        img = product.images[0].url if product.images else ""
        order_items.append({
            "product_id": product.id, "slug": product.slug,
            "name_fr": product.name_fr, "name_en": product.name_en, "image": resolve_media(img),
            "variant_id": variant.id, "size": variant.size, "color": variant.color,
            "quantity": line.quantity, "unit_price": unit_display, "line_total": line_display,
            "customization": line.customization if has_custom else None,
        })
        variant_map[variant.id] = (variant, line.quantity, product)
        stripe_line_items.append({
            "price_data": {
                "currency": charge_currency.lower(),
                "product_data": {"name": f"{product.name_en}" + (f" ({variant.size})" if variant.size else "")},
                "unit_amount": int(round(unit_charge * 100)),
            },
            "quantity": line.quantity,
        })

    # promo
    promo, promo_error = await resolve_promo(db, promo_code, subtotal_eur, email, user)
    discount_eur = promo_discount_eur(promo, subtotal_eur)
    discount_display = convert_from_eur(discount_eur, currency, rates) or 0
    discount_charge = convert_from_eur(discount_eur, charge_currency, rates) or 0

    # shipping
    methods = [m for m in settings["shipping"]["methods"] if m["country"] == shipping_country]
    if not methods:
        methods = [{"country": shipping_country, "country_name": shipping_country,
                    "name_fr": "Livraison internationale", "name_en": "International shipping",
                    "cost_eur": 15.0, "delay_fr": "7-14 jours", "delay_en": "7-14 days"}]
    method = dict(methods[min(shipping_method_index, len(methods) - 1)])
    free_ship = bool(promo and promo.free_shipping)
    ship_cost_eur = 0.0 if free_ship else float(method["cost_eur"])
    ship_display = convert_from_eur(ship_cost_eur, currency, rates)
    ship_charge = convert_from_eur(ship_cost_eur, charge_currency, rates)
    if ship_charge and ship_charge > 0:
        stripe_line_items.append({
            "price_data": {"currency": charge_currency.lower(),
                           "product_data": {"name": method["name_en"]},
                           "unit_amount": int(round(ship_charge * 100))},
            "quantity": 1,
        })

    subtotal_display = round_currency(subtotal_display, currency)
    subtotal_charge = round_currency(subtotal_charge, charge_currency)
    discount_display = min(discount_display, subtotal_display)
    discount_charge = min(discount_charge, subtotal_charge)
    total_display = round_currency(subtotal_display - discount_display + (ship_display or 0), currency)
    total_charge = round_currency(subtotal_charge - discount_charge + (ship_charge or 0), charge_currency)

    return {
        "items": order_items, "issues": issues, "currency": currency,
        "charge_currency": charge_currency, "subtotal": subtotal_display,
        "shipping_cost": ship_display or 0, "total": total_display,
        "discount": discount_display, "discount_charge": discount_charge,
        "promo": promo, "promo_error": promo_error, "free_shipping": free_ship,
        "charge_total": total_charge, "shipping_method": method,
        "stripe_line_items": stripe_line_items, "variant_map": variant_map,
    }


def _public_calc(calc, notice):
    return {
        "items": calc["items"], "issues": calc["issues"], "currency": calc["currency"],
        "charge_currency": calc["charge_currency"], "subtotal": calc["subtotal"],
        "shipping_cost": calc["shipping_cost"], "discount": calc["discount"], "total": calc["total"],
        "charge_total": calc["charge_total"], "shipping_method": calc["shipping_method"],
        "promo": calc["promo"].to_dict() if calc["promo"] else None,
        "promo_error": calc["promo_error"], "free_shipping": calc["free_shipping"],
        "payment_notice": notice,
    }


def _notice(calc):
    if calc["currency"] == calc["charge_currency"]:
        return ""
    return (f"Le paiement sera traite en {calc['charge_currency']} pour un montant de "
            f"{calc['charge_total']} {calc['charge_currency']} (equivalent affiche: "
            f"{calc['total']} {calc['currency']}).")


@router.post("/checkout/validate")
async def checkout_validate(data: CheckoutInput, db: AsyncSession = Depends(get_db), user=Depends(get_optional_user)):
    calc = await _compute_order(db, data.items, data.currency.upper(), data.shipping.country,
                                data.shipping_method_index, data.promo_code, data.shipping.email, user)
    return _public_calc(calc, _notice(calc))


class PromoCheck(BaseModel):
    code: str
    subtotal_eur: float = 0
    email: Optional[str] = None


@router.post("/promo/check")
async def promo_check(data: PromoCheck, db: AsyncSession = Depends(get_db), user=Depends(get_optional_user)):
    promo, err = await resolve_promo(db, data.code, data.subtotal_eur, data.email, user)
    if err:
        return {"valid": False, "error": err}
    return {"valid": True, "promo": promo.to_dict(), "discount_eur": promo_discount_eur(promo, data.subtotal_eur)}


@router.post("/checkout/create")
async def checkout_create(data: CheckoutInput, request: Request,
                          db: AsyncSession = Depends(get_db), user=Depends(get_optional_user)):
    calc = await _compute_order(db, data.items, data.currency.upper(), data.shipping.country,
                                data.shipping_method_index, data.promo_code, data.shipping.email, user)
    if calc["issues"]:
        raise HTTPException(status_code=409, detail={"message": "Certains articles sont indisponibles", "issues": calc["issues"]})
    if not calc["items"]:
        raise HTTPException(status_code=400, detail="Panier vide")
    if data.promo_code and calc["promo_error"]:
        raise HTTPException(status_code=400, detail={"message": "Code promo invalide", "promo_error": calc["promo_error"]})

    notice = _notice(calc)
    order = Order(
        order_number=gen_order_number(), user_id=user.id if user else None,
        email=data.shipping.email.lower().strip(), first_name=data.shipping.first_name,
        last_name=data.shipping.last_name, phone=data.shipping.phone,
        status="pending_payment", payment_status="pending",
        currency=calc["currency"], charge_currency=calc["charge_currency"],
        subtotal=calc["subtotal"], shipping_cost=calc["shipping_cost"], discount=calc["discount"],
        total=calc["total"], charge_total=calc["charge_total"], payment_notice=notice,
        shipping_address=data.shipping.model_dump(), shipping_method=calc["shipping_method"],
        items=calc["items"], lang=data.lang if data.lang in ("fr", "en") else "fr",
        promo_code=calc["promo"].code if calc["promo"] else "",
        status_history=[{"status": "pending_payment", "at": datetime.now(timezone.utc).isoformat(), "by": "system"}],
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    origin = data.origin_url.rstrip("/")
    session_kwargs = dict(
        line_items=calc["stripe_line_items"],
        mode="payment",
        success_url=f"{origin}/order/confirmation?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin}/checkout?cancelled=1",
        customer_email=order.email,
        metadata={"order_id": order.id, "order_number": order.order_number, "promo_code": order.promo_code},
    )
    if calc["discount_charge"] > 0:
        coupon = stripe.Coupon.create(amount_off=int(round(calc["discount_charge"] * 100)),
                                      currency=calc["charge_currency"].lower(), duration="once",
                                      name=f"Code {calc['promo'].code}")
        session_kwargs["discounts"] = [{"coupon": coupon.id}]
    session = stripe.checkout.Session.create(**session_kwargs)
    order.stripe_session_id = session.id
    db.add(Payment(order_id=order.id, provider="stripe", session_id=session.id,
                   amount=calc["charge_total"], currency=calc["charge_currency"], status="pending"))
    await db.commit()
    return {"checkout_url": session.url, "session_id": session.id,
            "order_number": order.order_number, "payment_notice": notice}


def push_history(order, status, by="system", note=""):
    hist = list(order.status_history or [])
    hist.append({"status": status, "at": datetime.now(timezone.utc).isoformat(), "by": by, "note": note})
    order.status_history = hist


async def _finalize_paid(db, order_id, payment_intent=None):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order or order.payment_status == "paid":
        return
    for item in (order.items or []):
        vr = await db.execute(select(ProductVariant).where(ProductVariant.id == item["variant_id"]))
        variant = vr.scalar_one_or_none()
        if variant:
            variant.stock = max(0, variant.stock - item["quantity"])
        pr = await db.execute(select(Product).where(Product.id == item["product_id"]))
        prod = pr.scalar_one_or_none()
        if prod:
            prod.sales_count = (prod.sales_count or 0) + item["quantity"]
    if order.promo_code:
        pres = await db.execute(select(PromoCode).where(PromoCode.code == order.promo_code))
        promo = pres.scalar_one_or_none()
        if promo:
            promo.used_count = (promo.used_count or 0) + 1
    order.payment_status = "paid"
    order.status = "paid"
    push_history(order, "paid")
    payres = await db.execute(select(Payment).where(Payment.session_id == order.stripe_session_id))
    pay = payres.scalar_one_or_none()
    if pay:
        pay.status = "succeeded"
        if payment_intent:
            pay.payment_intent = payment_intent
    await db.commit()
    await send_order_email(db, order, "order_confirmed")
    await notify_admin_new_order(db, order)


@router.get("/payments/status/{session_id}")
async def payment_status(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Order).where(Order.stripe_session_id == session_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    if order.payment_status != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                await _finalize_paid(db, order.id, s.payment_intent)
                await db.refresh(order)
        except stripe.error.StripeError:
            pass
    return {"session_id": session_id, "order_number": order.order_number,
            "payment_status": order.payment_status, "status": order.status,
            "order": order.to_dict()}


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid signature")
    obj, t = event["data"]["object"], event["type"]
    async with AsyncSessionLocal() as db:
        if t == "checkout.session.completed":
            oid = (obj.get("metadata") or {}).get("order_id")
            if oid:
                await _finalize_paid(db, oid, obj.get("payment_intent"))
        elif t == "charge.refunded":
            pi = obj.get("payment_intent")
            res = await db.execute(select(Payment).where(Payment.payment_intent == pi))
            pay = res.scalar_one_or_none()
            if pay:
                pay.status = "refunded"
                ores = await db.execute(select(Order).where(Order.id == pay.order_id))
                o = ores.scalar_one_or_none()
                if o:
                    o.payment_status = "refunded"
                await db.commit()
    return {"status": "ok"}


# ---------- Customer orders ----------
@router.get("/orders")
async def my_orders(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Order).where(Order.user_id == user.id).order_by(Order.created_at.desc()))
    return [o.to_dict() for o in result.scalars().all()]


@router.get("/orders/{order_number}")
async def order_detail(order_number: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Order).where(Order.order_number == order_number))
    order = result.scalar_one_or_none()
    if not order or (order.user_id != user.id and user.role != "admin"):
        raise HTTPException(status_code=404, detail="Commande introuvable")
    return order.to_dict()


class TrackIn(BaseModel):
    order_number: str
    email: str


@router.post("/orders/track")
async def track_order(data: TrackIn, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Order).where(
        func.upper(Order.order_number) == data.order_number.strip().upper(),
        Order.email == data.email.strip().lower()))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable. Verifiez le numero et l'e-mail.")
    return order.to_dict(public=True)
