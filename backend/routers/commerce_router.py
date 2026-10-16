import os
import asyncio
import logging
import secrets
import stripe
from datetime import datetime, timezone, timedelta, date as date_cls
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db, AsyncSessionLocal
from models import Product, ProductVariant, Order, Payment, WishlistItem, PromoCode, ClaimMessage
from auth import get_current_user, get_optional_user
from utils import (
    get_rates, get_settings, product_prices, convert_from_eur, round_currency,
    serialize_product, gen_order_number, STRIPE_SUPPORTED, resolve_media,
    PUBLIC_BASE_URL, get_available_slots_for_date,
    customization_price_eur, validate_customization,
)
from emails import (
    send_order_email, notify_admin_new_order, send_templated, ADMIN_NOTIFY_EMAIL,
    tpl_cancellation_requested, tpl_cancellation_admin_notify,
    tpl_claim_requested, tpl_claim_admin_notify,
)

logger = logging.getLogger("cakes.commerce")

router = APIRouter(tags=["commerce"])
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")


# ---------- Promo codes ----------
async def resolve_promo(db, code: str | None, subtotal_eur: float, email: str | None, user):
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


# ---------- Helpers réclamation ----------
def _validate_claim_media(raw_media: list, orders_cfg: dict) -> list:
    """
    ⭐ Valide et normalise les médias d'une réclamation.
    Limite le nombre de photos/vidéos selon settings.orders.claim_media_max_*.
    Retourne une liste propre de {"type": "image"|"video", "url": "..."}.
    """
    max_photos = int(orders_cfg.get("claim_media_max_photos", 3))
    max_videos = int(orders_cfg.get("claim_media_max_videos", 1))
    media_urls = []
    photo_count = 0
    video_count = 0
    for m in (raw_media or [])[: max_photos + max_videos + 2]:
        if not isinstance(m, dict):
            continue
        url = (m.get("url") or "").strip()
        typ = (m.get("type") or "").strip().lower()
        if not url or typ not in ("image", "video"):
            continue
        if typ == "image" and photo_count >= max_photos:
            continue
        if typ == "video" and video_count >= max_videos:
            continue
        media_urls.append({"type": typ, "url": url})
        if typ == "image":
            photo_count += 1
        else:
            video_count += 1
    return media_urls


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
    customer_note: Optional[str] = None
    scheduled_date: Optional[str] = None
    scheduled_time_slot: Optional[str] = None
    # ⭐ Mode de paiement : "stripe" | "cod"
    payment_method: str = "stripe"


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
        custom_price_eur = 0.0
        if has_custom:
            try:
                validate_customization(product, line.customization)
            except ValueError as e:
                issues.append({
                    "product_id": line.product_id,
                    "variant_id": variant.id,
                    "reason": "invalid_customization",
                    "message": str(e),
                })
                continue
            custom_price_eur = customization_price_eur(product, line.customization)

        pp = product_prices(product, rates)
        extra_disp = convert_from_eur(variant.extra_price_eur, currency, rates) or 0
        custom_disp = convert_from_eur(custom_price_eur, currency, rates) if has_custom else 0
        unit_display = round_currency(pp[currency]["price"] + extra_disp + (custom_disp or 0), currency)
        line_display = round_currency(unit_display * line.quantity, currency)
        subtotal_display += line_display

        extra_chg = convert_from_eur(variant.extra_price_eur, charge_currency, rates) or 0
        custom_chg = convert_from_eur(custom_price_eur, charge_currency, rates) if has_custom else 0
        unit_charge = round_currency(pp[charge_currency]["price"] + extra_chg + (custom_chg or 0), charge_currency)
        subtotal_charge += round_currency(unit_charge * line.quantity, charge_currency)
        subtotal_eur += (pp["EUR"]["price"] + float(variant.extra_price_eur or 0)
                         + (custom_price_eur if has_custom else 0)) * line.quantity

        img = product.images[0].url if product.images else ""
        order_items.append({
            "product_id": product.id, "slug": product.slug,
            "name_fr": product.name_fr, "name_en": product.name_en, "image": resolve_media(img),
            "variant_id": variant.id, "size": variant.size, "color": variant.color,
            "quantity": line.quantity, "unit_price": unit_display, "line_total": line_display,
            "customization": line.customization if has_custom else None,
            "customization_price_eur": custom_price_eur if has_custom else 0,
            "customization_fields": (product.customization_fields or []) if has_custom else [],
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

    promo, promo_error = await resolve_promo(db, promo_code, subtotal_eur, email, user)
    discount_eur = promo_discount_eur(promo, subtotal_eur)
    discount_display = convert_from_eur(discount_eur, currency, rates) or 0
    discount_charge = convert_from_eur(discount_eur, charge_currency, rates) or 0

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


@router.get("/orders/available-slots")
async def available_slots(date: str, db: AsyncSession = Depends(get_db)):
    settings = await get_settings(db)
    orders_cfg = settings.get("orders", {}) or {}

    try:
        target = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Date invalide (format AAAA-MM-JJ).")

    now = datetime.now(timezone.utc)
    min_lead_hours = int(orders_cfg.get("min_lead_hours", 48))
    max_advance_days = int(orders_cfg.get("max_advance_days", 180))
    min_date = (now + timedelta(hours=min_lead_hours)).date()
    max_date = (now + timedelta(days=max_advance_days)).date()

    if target < min_date:
        return {
            "available": False, "slots": [],
            "reason_fr": f"Date trop proche. Commande possible à partir du {min_date.strftime('%d/%m/%Y')}.",
            "reason_en": f"Date too soon. Order available from {min_date.strftime('%d/%m/%Y')}.",
            "min_date": min_date.isoformat(), "max_date": max_date.isoformat(),
        }
    if target > max_date:
        return {
            "available": False, "slots": [],
            "reason_fr": f"Date trop éloignée (max {max_advance_days} jours).",
            "reason_en": f"Date too far ahead (max {max_advance_days} days).",
            "min_date": min_date.isoformat(), "max_date": max_date.isoformat(),
        }

    available, slots, reason_fr, reason_en = get_available_slots_for_date(target, orders_cfg)
    return {
        "available": available, "slots": slots, "reason_fr": reason_fr, "reason_en": reason_en,
        "min_date": min_date.isoformat(), "max_date": max_date.isoformat(),
    }


def _validate_scheduled(date_str: str | None, slot: str | None, settings: dict) -> tuple:
    orders_cfg = settings.get("orders", {}) or {}
    min_lead_hours = int(orders_cfg.get("min_lead_hours", 48))
    max_advance_days = int(orders_cfg.get("max_advance_days", 180))

    if not date_str:
        raise HTTPException(status_code=400, detail="Choisissez une date de livraison.")
    try:
        target = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Date invalide (format attendu : AAAA-MM-JJ).")

    now = datetime.now(timezone.utc)
    min_date = (now + timedelta(hours=min_lead_hours)).date()
    max_date = (now + timedelta(days=max_advance_days)).date()

    if target < min_date:
        raise HTTPException(status_code=400,
            detail=f"La date doit être au moins {min_lead_hours}h après la commande "
                   f"(à partir du {min_date.strftime('%d/%m/%Y')}).")
    if target > max_date:
        raise HTTPException(status_code=400,
            detail=f"Date trop éloignée (maximum {max_advance_days} jours à l'avance).")

    available, slots, reason_fr, reason_en = get_available_slots_for_date(target, orders_cfg)
    if not available:
        raise HTTPException(status_code=400, detail=reason_fr or "Date non disponible.")

    if not slot:
        raise HTTPException(status_code=400, detail="Choisissez un créneau horaire.")
    valid_values = {s.get("value") for s in slots}
    if slot not in valid_values:
        raise HTTPException(status_code=400, detail="Créneau horaire invalide pour cette date.")

    return target, slot


# ================================================================
# ⭐ Disponibilité du paiement à la livraison (COD)
# ================================================================

@router.post("/checkout/cod-availability")
async def cod_availability(data: dict, db: AsyncSession = Depends(get_db)):
    """
    Vérifie si le paiement à la livraison est disponible pour un panier + pays.
    Payload : { items: [{product_id, variant_id, quantity, customization}], country: "ML" }
    """
    settings = await get_settings(db)
    cod = (settings.get("payment_methods", {}) or {}).get("cod", {}) or {}

    if not cod.get("enabled"):
        return {"available": False, "reason_fr": "Paiement à la livraison désactivé", "reason_en": "COD disabled"}

    country = (data.get("country") or "").upper()
    if country not in [c.upper() for c in (cod.get("countries") or [])]:
        return {"available": False, "reason_fr": "Non disponible dans votre pays", "reason_en": "Not available in your country"}

    items = data.get("items") or []
    if not items:
        return {"available": False, "reason_fr": "Panier vide", "reason_en": "Empty cart"}

    rates = await get_rates(db)
    currency = "XOF"
    subtotal_display = 0.0
    mode = cod.get("mode", "all")

    # ⭐ ÉTAPE 1 : on précharge TOUS les produits en UNE requête avec selectinload
    product_ids = [line.get("product_id") for line in items if line.get("product_id")]
    if not product_ids:
        return {"available": False, "reason_fr": "Panier invalide", "reason_en": "Invalid cart"}

    pr = await db.execute(
        select(Product)
        .where(Product.id.in_(product_ids))
        .options(selectinload(Product.variants))
    )
    products_by_id = {p.id: p for p in pr.scalars().unique().all()}

    # ⭐ ÉTAPE 2 : validation + calcul du sous-total
    for line in items:
        pid = line.get("product_id")
        product = products_by_id.get(pid)
        if not product or not product.published:
            return {"available": False, "reason_fr": "Produit indisponible", "reason_en": "Unavailable product"}

        # ⭐ Vérifier cod_allowed uniquement en mode "selected"
        if mode == "selected" and not product.cod_allowed:
            return {
                "available": False,
                "reason_fr": f"Le produit « {product.name_fr} » n'est pas éligible au paiement à la livraison",
                "reason_en": f"Product « {product.name_en} » is not eligible for COD",
            }

        # ⭐ Trouver la variante (préchargée, pas de lazy load)
        variant = next((v for v in (product.variants or []) if v.id == line.get("variant_id")), None)
        if not variant:
            continue

        pp = product_prices(product, rates)
        extra = convert_from_eur(variant.extra_price_eur or 0, currency, rates) or 0
        custom_price = 0
        if line.get("customization") and product.customizable:
            custom_price = convert_from_eur(
                customization_price_eur(product, line.get("customization")), currency, rates
            ) or 0
        unit = pp[currency]["price"] + extra + custom_price
        subtotal_display += unit * (line.get("quantity") or 1)

    min_xof = int(cod.get("min_amount_xof", 0))
    max_xof = int(cod.get("max_amount_xof", 500000))
    extra_fee_xof = int(cod.get("extra_fee_xof", 0))

    if subtotal_display < min_xof:
        return {
            "available": False,
            "reason_fr": f"Montant minimum pour le paiement à la livraison : {min_xof:,} FCFA".replace(",", " "),
            "reason_en": f"Minimum amount for COD: {min_xof} XOF",
        }
    if subtotal_display > max_xof:
        return {
            "available": False,
            "reason_fr": f"Montant maximum dépassé ({max_xof:,} FCFA). Utilisez le paiement en ligne.".replace(",", " "),
            "reason_en": f"Maximum amount exceeded ({max_xof} XOF). Use online payment.",
        }

    return {
        "available": True,
        "extra_fee_xof": extra_fee_xof,
        "instructions_fr": cod.get("instructions_fr", ""),
        "instructions_en": cod.get("instructions_en", ""),
    }


# ================================================================
# ⭐ Checkout — Stripe OU Paiement à la livraison
# ================================================================

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

    settings = await get_settings(db)
    scheduled_date, scheduled_slot = _validate_scheduled(
        data.scheduled_date, data.scheduled_time_slot, settings
    )

    # ⭐ Validation du mode de paiement
    payment_method = (data.payment_method or "stripe").strip().lower()
    if payment_method not in ("stripe", "cod"):
        raise HTTPException(status_code=400, detail="Mode de paiement invalide")

    cod = (settings.get("payment_methods", {}) or {}).get("cod", {}) or {}
    extra_fee_xof = 0

    if payment_method == "cod":
        # Vérifications COD
        if not cod.get("enabled"):
            raise HTTPException(status_code=400, detail="Le paiement à la livraison est désactivé")

        country = (data.shipping.country or "").upper()
        if country not in [c.upper() for c in (cod.get("countries") or [])]:
            raise HTTPException(status_code=400, detail="Paiement à la livraison non disponible dans votre pays")

        # ⭐ Vérifie les produits avec selectinload (évite lazy load)
        mode = cod.get("mode", "all")
        product_ids = [line.product_id for line in data.items]
        pr = await db.execute(
            select(Product)
            .where(Product.id.in_(product_ids))
            .options(selectinload(Product.variants))
        )
        products_by_id = {p.id: p for p in pr.scalars().unique().all()}

        if mode == "selected":
            for line in data.items:
                product = products_by_id.get(line.product_id)
                if not product:
                    continue
                if not product.cod_allowed:
                    raise HTTPException(status_code=400,
                        detail=f"Le produit « {product.name_fr} » n'est pas éligible au paiement à la livraison")

        # Vérifie min/max sur le total
        total_xof = calc["total"] if calc["currency"] == "XOF" else calc["total"] * 655.957
        min_xof = int(cod.get("min_amount_xof", 0))
        max_xof = int(cod.get("max_amount_xof", 500000))
        if total_xof < min_xof:
            raise HTTPException(status_code=400, detail=f"Montant minimum COD : {min_xof} FCFA")
        if total_xof > max_xof:
            raise HTTPException(status_code=400, detail=f"Montant maximum COD : {max_xof} FCFA")

        # ⭐ Frais COD
        extra_fee_xof = int(cod.get("extra_fee_xof", 0))

    notice = _notice(calc)
    customer_note = (data.customer_note or "").strip()[:500]

    # ⭐ Gestion des montants
    charge_currency = calc["charge_currency"]
    charge_total = calc["charge_total"]
    total = calc["total"]
    shipping_cost = calc["shipping_cost"]

    # ⭐ Ajoute les frais COD au total
    if payment_method == "cod" and extra_fee_xof > 0:
        rates = await get_rates(db)
        extra_display = convert_from_eur(extra_fee_xof / (rates.get("XOF", 655.957) or 655.957), calc["currency"], rates)
        total = round_currency(total + extra_display, calc["currency"])
        extra_eur = round(extra_fee_xof / (rates.get("XOF", 655.957) or 655.957), 2)
        charge_total = round_currency(charge_total + extra_eur, charge_currency)

    order = Order(
        order_number=gen_order_number(), user_id=user.id if user else None,
        email=data.shipping.email.lower().strip(), first_name=data.shipping.first_name,
        last_name=data.shipping.last_name, phone=data.shipping.phone,
        status="pending_payment", payment_status="pending",
        currency=calc["currency"], charge_currency=charge_currency,
        subtotal=calc["subtotal"], shipping_cost=shipping_cost, discount=calc["discount"],
        total=total, charge_total=charge_total, payment_notice=notice,
        shipping_address=data.shipping.model_dump(), shipping_method=calc["shipping_method"],
        items=calc["items"], lang=data.lang if data.lang in ("fr", "en") else "fr",
        promo_code=calc["promo"].code if calc["promo"] else "",
        customer_note=customer_note,
        scheduled_date=scheduled_date,
        scheduled_time_slot=scheduled_slot,
        payment_method=payment_method,   # ⭐ NOUVEAU
        status_history=[{"status": "pending_payment", "at": datetime.now(timezone.utc).isoformat(), "by": "system"}],
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    if user:
        try:
            from models import Cart
            cart = (await db.execute(select(Cart).where(Cart.user_id == user.id))).scalar_one_or_none()
            if cart:
                cart.recovered_order_id = order.id
                await db.commit()
        except Exception:
            pass

    # ============================================================
    # ⭐ CAS COD : on ne passe PAS par Stripe
    # ============================================================
    if payment_method == "cod":
        push_history(order, "pending_payment", by="client", note="Commande COD créée — paiement à la livraison")
        await db.commit()

        try:
            await send_order_email(db, order, "order_confirmed")
        except Exception:
            pass
        try:
            await notify_admin_new_order(db, order)
        except Exception:
            pass

        return {
            "checkout_url": None,
            "session_id": None,
            "order_number": order.order_number,
            "payment_notice": notice,
            "payment_method": "cod",
            "order_id": order.id,
            "message": "Commande enregistrée. Paiement à la livraison.",
        }

    # ============================================================
    # CAS Stripe (comportement habituel)
    # ============================================================
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
            "order_number": order.order_number, "payment_notice": notice,
            "payment_method": "stripe"}


def push_history(order, status, by="system", note=""):
    hist = list(order.status_history or [])
    hist.append({"status": status, "at": datetime.now(timezone.utc).isoformat(), "by": by, "note": note})
    order.status_history = hist


async def _finalize_paid_inner(db, order_id, payment_intent=None):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        logger.error(f"[FINALIZE] Order {order_id} introuvable")
        return
    if order.payment_status == "paid":
        logger.info(f"[FINALIZE] Order {order_id} déjà payée, skip")
        return

    logger.info(f"[FINALIZE] Traitement order {order.order_number}")

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
    pres = await db.execute(select(Payment).where(Payment.order_id == order.id))
    for pay in pres.scalars().all():
        if pay.status == "pending":
            pay.status = "succeeded"
            if payment_intent and not pay.payment_intent:
                pay.payment_intent = payment_intent
    push_history(order, "paid")
    await db.commit()
    logger.info(f"[FINALIZE] Commit OK pour {order.order_number}")

    try:
        await send_order_email(db, order, "order_confirmed")
        logger.info(f"[FINALIZE] ✅ Email client envoyé à {order.email}")
    except Exception as e:
        logger.error(f"[FINALIZE] ❌ Erreur email client : {e}", exc_info=True)

    try:
        await notify_admin_new_order(db, order)
        logger.info(f"[FINALIZE] ✅ Email admin envoyé")
    except Exception as e:
        logger.error(f"[FINALIZE] ❌ Erreur email admin : {e}", exc_info=True)


async def _finalize_paid(db, order_id, payment_intent=None):
    try:
        await asyncio.wait_for(_finalize_paid_inner(db, order_id, payment_intent), timeout=25)
    except asyncio.TimeoutError:
        logger.error(f"[FINALIZE] ❌ TIMEOUT pour order_id={order_id}")
    except Exception as e:
        logger.error(f"[FINALIZE] ❌ ERREUR pour order_id={order_id}: {e}", exc_info=True)


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
        except stripe.error.StripeError as e:
            logger.warning(f"[STATUS] Stripe error: {e}")
    return {"session_id": session_id, "order_number": order.order_number,
            "payment_status": order.payment_status, "status": order.status,
            "order": order.to_dict()}


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        logger.warning(f"[WEBHOOK] Invalid signature: {e}")
        raise HTTPException(status_code=400, detail="Invalid signature")
    obj, t = event["data"]["object"], event["type"]
    logger.info(f"[WEBHOOK] Event: {t}")
    async with AsyncSessionLocal() as db:
        if t == "checkout.session.completed":
            meta = obj.get("metadata") or {}
            oid = meta.get("order_id")
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


# ---------- Client order actions ----------
def _assert_pending(order: Order):
    if order.status != "pending_payment" or order.payment_status != "pending":
        raise HTTPException(status_code=400,
            detail="Cette commande ne peut plus etre modifiee (deja payee ou traitee).")


async def _get_my_order(db: AsyncSession, user, order_number: str) -> Order:
    order = (await db.execute(select(Order).where(
        Order.order_number == order_number,
        Order.user_id == user.id,
    ))).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    return order


@router.post("/orders/{order_number}/retry-payment")
async def retry_payment(order_number: str, data: dict, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    order = await _get_my_order(db, user, order_number)
    _assert_pending(order)

    if order.payment_method == "cod":
        raise HTTPException(status_code=400, detail="Cette commande est en paiement à la livraison")

    origin = (data.get("origin_url") or "").rstrip("/")
    if not origin:
        raise HTTPException(status_code=400, detail="origin_url requis")

    shipping_addr = order.shipping_address or {}
    shipping_country = shipping_addr.get("country", "")

    method_name = (order.shipping_method or {}).get("name_fr", "")
    try:
        from utils import get_settings
        settings = await get_settings(db)
        methods = (settings.get("shipping", {}) or {}).get("methods", []) or []
        indices = [i for i, m in enumerate(methods) if m.get("country") == shipping_country and m.get("name_fr") == method_name]
        method_index = indices[0] if indices else 0
    except Exception:
        method_index = 0

    try:
        calc = await _compute_order(
            db,
            items=[{
                "product_id": it.get("product_id"),
                "variant_id": it.get("variant_id"),
                "quantity": it.get("quantity", 1),
                "customization": it.get("customization"),
            } for it in (order.items or [])],
            currency=order.currency,
            shipping_country=shipping_country,
            shipping_method_index=method_index,
            promo_code=order.promo_code or None,
            email=order.email,
            user=user,
        )
    except Exception:
        calc = None

    if calc and calc.get("stripe_line_items"):
        line_items = calc["stripe_line_items"]
        discounts = None
        if calc.get("discount_charge", 0) > 0:
            coupon = stripe.Coupon.create(
                amount_off=int(round(calc["discount_charge"] * 100)),
                currency=calc["charge_currency"].lower(),
                duration="once",
                name=f"Code {order.promo_code}",
            )
            discounts = [{"coupon": coupon.id}]
    else:
        line_items = [{
            "price_data": {
                "currency": order.charge_currency.lower(),
                "product_data": {"name": f"Commande {order.order_number}"},
                "unit_amount": int(round(float(order.charge_total or 0) * 100)),
            },
            "quantity": 1,
        }]
        discounts = None

    session_kwargs = dict(
        line_items=line_items,
        mode="payment",
        success_url=f"{origin}/order/confirmation?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin}/checkout?cancelled=1",
        customer_email=order.email,
        metadata={"order_id": order.id, "order_number": order.order_number, "promo_code": order.promo_code or "", "retry": "1"},
    )
    if discounts:
        session_kwargs["discounts"] = discounts

    try:
        session = stripe.checkout.Session.create(**session_kwargs)
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    order.stripe_session_id = session.id
    push_history(order, "pending_payment", by="client", note="Nouvelle session de paiement")
    db.add(Payment(order_id=order.id, provider="stripe", session_id=session.id,
                   amount=order.charge_total, currency=order.charge_currency, status="pending"))
    await db.commit()

    return {"checkout_url": session.url, "session_id": session.id}


@router.post("/orders/{order_number}/cancel")
async def cancel_my_order(order_number: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    order = await _get_my_order(db, user, order_number)
    _assert_pending(order)
    pays = (await db.execute(select(Payment).where(Payment.order_id == order.id))).scalars().all()
    for p in pays:
        await db.delete(p)
    await db.delete(order)
    await db.commit()
    return {"ok": True}


@router.delete("/orders/{order_number}")
async def delete_my_order(order_number: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    order = await _get_my_order(db, user, order_number)
    _assert_pending(order)
    pays = (await db.execute(select(Payment).where(Payment.order_id == order.id))).scalars().all()
    for p in pays:
        await db.delete(p)
    await db.delete(order)
    await db.commit()
    return {"ok": True}


# ================================================================
# ⭐ RÉCLAMATION CLIENT (avec médias + messagerie)
# ================================================================

def _gen_rma_code(order_number: str) -> str:
    suffix = str(secrets.randbelow(9000) + 1000)
    return f"RET-{order_number}-{suffix}"


@router.post("/orders/{order_number}/request-return")
async def request_return(order_number: str, data: dict, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    ⭐ Réclamation client — délai & médias configurables via settings.orders.claim_*.
    Crée la commande en statut return_requested + un premier message ClaimMessage.
    """
    order = await _get_my_order(db, user, order_number)

    if order.status != "delivered":
        raise HTTPException(status_code=400, detail="Seule une commande livree peut faire l'objet d'une reclamation.")
    if order.payment_status != "paid":
        raise HTTPException(status_code=400, detail="Seule une commande payee peut faire l'objet d'une reclamation.")
    if order.status in ("return_requested", "return_approved", "return_shipped", "return_received"):
        raise HTTPException(status_code=400, detail="Une reclamation est deja en cours.")

    settings = await get_settings(db)
    orders_cfg = settings.get("orders", {}) or {}

    claim_window_hours = int(orders_cfg.get("claim_window_hours", 48))
    if order.delivered_at:
        age = datetime.now(timezone.utc) - order.delivered_at
        if age.total_seconds() > claim_window_hours * 3600:
            raise HTTPException(
                status_code=403,
                detail=f"Le delai de reclamation de {claim_window_hours}h est depasse. Contactez notre service client.",
            )

    selected = data.get("products") or []
    if not selected:
        raise HTTPException(status_code=400, detail="Selectionnez au moins un article concerne.")

    general_reason = (data.get("reason") or "").strip()[:500]
    media_urls = _validate_claim_media(data.get("media_urls") or [], orders_cfg)

    items_map = {(it.get("product_id"), it.get("variant_id")): it for it in (order.items or [])}
    return_products = []
    for sel in selected:
        key = (sel.get("product_id"), sel.get("variant_id"))
        item = items_map.get(key)
        if not item:
            continue
        return_products.append({
            "product_id": item.get("product_id"),
            "variant_id": item.get("variant_id"),
            "slug": item.get("slug"),
            "name_fr": item.get("name_fr"),
            "name_en": item.get("name_en"),
            "size": item.get("size"),
            "quantity": item.get("quantity", 1),
            "unit_price": item.get("unit_price", 0),
            "line_total": item.get("line_total", 0),
            "image": item.get("image"),
            "reason": (sel.get("reason") or "").strip()[:200],
        })

    if not return_products:
        raise HTTPException(status_code=400, detail="Aucun article valide dans la selection.")

    rma_code = _gen_rma_code(order.order_number)
    now = datetime.now(timezone.utc)

    order.status = "return_requested"
    order.return_reason = general_reason
    order.return_type = "refund"
    order.return_products = return_products
    order.return_rma_code = rma_code
    order.return_requested_at = now
    order.return_decided_at = None
    order.return_refused_reason = ""
    order.return_tracking_number = ""
    order.return_received_at = None
    order.return_exchange_product_id = None
    order.return_exchange_variant_id = None
    order.exchange_price_diff = 0
    order.exchange_payment_status = ""
    order.exchange_stripe_session_id = ""
    order.claim_media_urls = media_urls
    push_history(order, "return_requested", by=user.email, note=f"Reclamation {rma_code} — {general_reason[:120]}")

    db.add(ClaimMessage(
        order_id=order.id,
        sender="client",
        sender_email=user.email,
        text=general_reason,
        media_urls=media_urls,
        requested_types=[],
    ))

    await db.commit()
    await db.refresh(order)

    try:
        lang = order.lang if order.lang in ("fr", "en") else "fr"
        products_for_email = []
        for rp in return_products:
            img = rp.get("image") or ""
            if img.startswith("/api/media/") and PUBLIC_BASE_URL.startswith("https://"):
                img = f"{PUBLIC_BASE_URL}{img}"
            products_for_email.append({
                "name_fr": rp.get("name_fr"),
                "name_en": rp.get("name_en"),
                "image_url": img,
                "reason_label": rp.get("reason") or general_reason,
            })
        subject, html = tpl_claim_requested(order.to_dict(), lang, rma_code, products_for_email)
        await send_templated(db, to=order.email, subject=subject, html=html,
                             template="claim_requested", order_id=order.id)
    except Exception as e:
        logger.warning(f"[CLAIM] Email client échoué: {e}")

    try:
        if ADMIN_NOTIFY_EMAIL:
            subject, html = tpl_claim_admin_notify(order.to_dict(), rma_code)
            await send_templated(db, to=ADMIN_NOTIFY_EMAIL, subject=subject, html=html,
                                 template="claim_admin_notify", order_id=order.id)
    except Exception as e:
        logger.warning(f"[CLAIM] Email admin échoué: {e}")

    return {
        "ok": True,
        "rma_code": rma_code,
        "status": order.status,
        "checkout_url": None,
        "exchange_price_diff": 0,
        "media_count": len(media_urls),
    }


# ⭐ Réponse du client à une demande d'infos
@router.post("/orders/{order_number}/claim/reply")
async def claim_reply(order_number: str, data: dict, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    order = await _get_my_order(db, user, order_number)

    if order.status not in ("return_requested", "return_approved", "return_received"):
        raise HTTPException(status_code=400, detail="Aucune réclamation en cours.")

    settings = await get_settings(db)
    orders_cfg = settings.get("orders", {}) or {}
    media_urls = _validate_claim_media(data.get("media_urls") or [], orders_cfg)

    text = (data.get("text") or "").strip()[:2000]
    if not text and not media_urls:
        raise HTTPException(status_code=400, detail="Ajoutez un message ou des fichiers.")

    msg = ClaimMessage(
        order_id=order.id,
        sender="client",
        sender_email=user.email,
        text=text,
        media_urls=media_urls,
        requested_types=[],
    )
    db.add(msg)

    existing = list(order.claim_media_urls or [])
    order.claim_media_urls = existing + media_urls

    order.claim_info_requested_at = None
    order.claim_info_request_message = ""
    order.claim_info_request_types = []

    push_history(order, order.status, by=user.email, note="Réponse du client à la demande d'infos")
    await db.commit()
    await db.refresh(msg)

    try:
        from emails import send_templated as _send, ADMIN_NOTIFY_EMAIL as _adm
        try:
            from emails import tpl_claim_client_replied
        except ImportError:
            tpl_claim_client_replied = None
        if _adm and tpl_claim_client_replied:
            subject, html = tpl_claim_client_replied(order.to_dict(), text, media_urls)
            await _send(db, to=_adm, subject=subject, html=html,
                        template="claim_client_replied", order_id=order.id)
    except Exception as e:
        logger.warning(f"[CLAIM] Notif admin échouée: {e}")

    return {"ok": True, "message": msg.to_dict()}


# ⭐ Annulation de la réclamation par le client
@router.post("/orders/{order_number}/claim/cancel")
async def claim_cancel(order_number: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    order = await _get_my_order(db, user, order_number)

    if order.status not in ("return_requested", "return_approved"):
        raise HTTPException(status_code=400, detail="Impossible d'annuler à ce stade.")

    order.status = "delivered"
    order.return_refused_reason = "Annulée par le client"
    order.return_decided_at = datetime.now(timezone.utc)
    order.claim_info_requested_at = None
    order.claim_info_request_message = ""
    order.claim_info_request_types = []
    push_history(order, "delivered", by=user.email, note="Réclamation annulée par le client")
    await db.commit()

    return {"ok": True, "status": order.status}


@router.post("/orders/{order_number}/request-cancellation")
async def request_cancellation(order_number: str, data: dict, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    order = await _get_my_order(db, user, order_number)

    if order.status not in ("paid", "preparing"):
        raise HTTPException(status_code=400,
            detail="Cette commande ne peut plus etre annulee. Utilisez 'Signaler un probleme' dans vos commandes.")
    if order.payment_status != "paid":
        raise HTTPException(status_code=400, detail="Seule une commande payee peut etre annulee.")
    if order.status == "cancellation_requested":
        raise HTTPException(status_code=400, detail="Une demande d'annulation est deja en cours.")

    reason = (data.get("reason") or "").strip()[:500]
    order.status = "cancellation_requested"
    order.cancellation_reason = reason
    order.cancellation_requested_at = datetime.now(timezone.utc)
    order.cancellation_decided_at = None
    order.cancellation_refused_reason = ""
    push_history(order, "cancellation_requested", by=user.email, note=reason)
    await db.commit()

    try:
        lang = order.lang if order.lang in ("fr", "en") else "fr"
        subject, html = tpl_cancellation_requested(order.to_dict(), lang)
        await send_templated(db, to=order.email, subject=subject, html=html,
                             template="cancellation_requested", order_id=order.id)
    except Exception:
        pass
    try:
        if ADMIN_NOTIFY_EMAIL:
            subject, html = tpl_cancellation_admin_notify(order.to_dict())
            await send_templated(db, to=ADMIN_NOTIFY_EMAIL, subject=subject, html=html,
                                 template="cancellation_admin_notify", order_id=order.id)
    except Exception:
        pass

    return {"ok": True, "status": order.status}


@router.post("/orders/{order_number}/hide")
async def hide_my_order(order_number: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    order = await _get_my_order(db, user, order_number)
    if order.status == "pending_payment":
        raise HTTPException(status_code=400,
            detail="Utilisez Annuler ou Supprimer pour les commandes en attente de paiement.")
    order.hidden_by_customer = True
    await db.commit()
    return {"ok": True}


@router.post("/orders/{order_number}/unhide")
async def unhide_my_order(order_number: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    order = await _get_my_order(db, user, order_number)
    order.hidden_by_customer = False
    await db.commit()
    return {"ok": True}