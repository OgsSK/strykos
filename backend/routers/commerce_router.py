import os
import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db, AsyncSessionLocal
from models import Product, ProductVariant, Order, Payment, WishlistItem
from auth import get_current_user, get_optional_user
from utils import (
    get_rates, get_settings, product_prices, convert_from_eur, round_currency,
    serialize_product, gen_order_number, STRIPE_SUPPORTED,
)

router = APIRouter(tags=["commerce"])
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")


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


async def _compute_order(db, items, currency, shipping_country, shipping_method_index):
    rates = await get_rates(db)
    settings = await get_settings(db)
    charge_currency = currency if currency in STRIPE_SUPPORTED else "EUR"
    order_items, issues = [], []
    subtotal_display = 0.0
    subtotal_charge = 0.0
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

        img = product.images[0].url if product.images else ""
        order_items.append({
            "product_id": product.id, "slug": product.slug,
            "name_fr": product.name_fr, "name_en": product.name_en, "image": img,
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

    # shipping
    methods = [m for m in settings["shipping"]["methods"] if m["country"] == shipping_country]
    if not methods:
        methods = [{"country": shipping_country, "country_name": shipping_country,
                    "name_fr": "Livraison internationale", "name_en": "International shipping",
                    "cost_eur": 15.0, "delay_fr": "7-14 jours", "delay_en": "7-14 days"}]
    method = methods[min(shipping_method_index, len(methods) - 1)]
    ship_display = convert_from_eur(method["cost_eur"], currency, rates)
    ship_charge = convert_from_eur(method["cost_eur"], charge_currency, rates)
    if ship_charge and ship_charge > 0:
        stripe_line_items.append({
            "price_data": {"currency": charge_currency.lower(),
                           "product_data": {"name": method["name_en"]},
                           "unit_amount": int(round(ship_charge * 100))},
            "quantity": 1,
        })

    subtotal_display = round_currency(subtotal_display, currency)
    subtotal_charge = round_currency(subtotal_charge, charge_currency)
    total_display = round_currency(subtotal_display + (ship_display or 0), currency)
    total_charge = round_currency(subtotal_charge + (ship_charge or 0), charge_currency)

    return {
        "items": order_items, "issues": issues, "currency": currency,
        "charge_currency": charge_currency, "subtotal": subtotal_display,
        "shipping_cost": ship_display or 0, "total": total_display,
        "charge_total": total_charge, "shipping_method": method,
        "stripe_line_items": stripe_line_items, "variant_map": variant_map,
    }


@router.post("/checkout/validate")
async def checkout_validate(data: CheckoutInput, db: AsyncSession = Depends(get_db)):
    calc = await _compute_order(db, data.items, data.currency.upper(), data.shipping.country, data.shipping_method_index)
    notice = ""
    if calc["currency"] != calc["charge_currency"]:
        notice = (f"Le paiement sera traite en {calc['charge_currency']} pour un montant de "
                  f"{calc['charge_total']} {calc['charge_currency']} (equivalent affiche: "
                  f"{calc['total']} {calc['currency']}).")
    return {
        "items": calc["items"], "issues": calc["issues"], "currency": calc["currency"],
        "charge_currency": calc["charge_currency"], "subtotal": calc["subtotal"],
        "shipping_cost": calc["shipping_cost"], "total": calc["total"],
        "charge_total": calc["charge_total"], "shipping_method": calc["shipping_method"],
        "payment_notice": notice,
    }


@router.post("/checkout/create")
async def checkout_create(data: CheckoutInput, request: Request,
                          db: AsyncSession = Depends(get_db), user=Depends(get_optional_user)):
    calc = await _compute_order(db, data.items, data.currency.upper(), data.shipping.country, data.shipping_method_index)
    if calc["issues"]:
        raise HTTPException(status_code=409, detail={"message": "Certains articles sont indisponibles", "issues": calc["issues"]})
    if not calc["items"]:
        raise HTTPException(status_code=400, detail="Panier vide")

    notice = ""
    if calc["currency"] != calc["charge_currency"]:
        notice = (f"Paiement traite en {calc['charge_currency']}: {calc['charge_total']} {calc['charge_currency']} "
                  f"(equivalent {calc['total']} {calc['currency']}).")

    order = Order(
        order_number=gen_order_number(), user_id=user.id if user else None,
        email=data.shipping.email.lower().strip(), first_name=data.shipping.first_name,
        last_name=data.shipping.last_name, phone=data.shipping.phone,
        status="pending_payment", payment_status="pending",
        currency=calc["currency"], charge_currency=calc["charge_currency"],
        subtotal=calc["subtotal"], shipping_cost=calc["shipping_cost"], discount=0,
        total=calc["total"], charge_total=calc["charge_total"], payment_notice=notice,
        shipping_address=data.shipping.model_dump(), shipping_method=calc["shipping_method"],
        items=calc["items"],
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    origin = data.origin_url.rstrip("/")
    session = stripe.checkout.Session.create(
        line_items=calc["stripe_line_items"],
        mode="payment",
        success_url=f"{origin}/order/confirmation?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin}/checkout?cancelled=1",
        customer_email=order.email,
        metadata={"order_id": order.id, "order_number": order.order_number},
    )
    order.stripe_session_id = session.id
    db.add(Payment(order_id=order.id, provider="stripe", session_id=session.id,
                   amount=calc["charge_total"], currency=calc["charge_currency"], status="pending"))
    await db.commit()
    return {"checkout_url": session.url, "session_id": session.id,
            "order_number": order.order_number, "payment_notice": notice}


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
    order.payment_status = "paid"
    order.status = "paid"
    payres = await db.execute(select(Payment).where(Payment.session_id == order.stripe_session_id))
    pay = payres.scalar_one_or_none()
    if pay:
        pay.status = "succeeded"
        if payment_intent:
            pay.payment_intent = payment_intent
    await db.commit()


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
