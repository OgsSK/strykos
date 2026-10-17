import os
import random
import logging
import secrets
import stripe
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import (Product, ProductImage, ProductVariant, Brand, Category, Order, Payment, Setting,
                    Profile, PromoCode, EmailLog,
                    ClaimMessage)
from auth import get_current_admin, create_driver_invite_token
from utils import get_rates, serialize_product, get_settings, normalize_media, convert_from_eur, bump_cache_version
from emails import (send_order_email, emails_enabled, EMAIL_FROM_NAME, EMAIL_REPLY_TO,
                    ADMIN_NOTIFY_EMAIL, send_templated,
                    tpl_cancellation_approved, tpl_cancellation_refused,
                    tpl_claim_approved, tpl_claim_refused, tpl_claim_refunded,
                    tpl_claim_info_request,
                    tpl_driver_invitation,
                    tpl_refund_multi)
from routers.commerce_router import push_history
from sqlalchemy import select, func, delete

logger = logging.getLogger("cakes.admin")

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_current_admin)])
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"


# ---------------- Dashboard ----------------
@router.get("/dashboard")
async def dashboard(db: AsyncSession = Depends(get_db)):
    orders_res = await db.execute(select(Order).order_by(Order.created_at.desc()))
    orders = orders_res.scalars().all()
    paid = [o for o in orders if o.payment_status == "paid"]
    now = datetime.now(timezone.utc)
    revenue_by_currency, revenue_30d = {}, {}
    for o in paid:
        revenue_by_currency[o.currency] = revenue_by_currency.get(o.currency, 0) + float(o.total or 0)
        if o.created_at and o.created_at >= now - timedelta(days=30):
            revenue_30d[o.currency] = revenue_30d.get(o.currency, 0) + float(o.total or 0)
    by_status = {}
    for o in orders:
        by_status[o.status] = by_status.get(o.status, 0) + 1

    series = []
    for i in range(13, -1, -1):
        day = (now - timedelta(days=i)).date()
        day_orders = [o for o in paid if o.created_at and o.created_at.date() == day]
        series.append({"date": day.isoformat(), "orders": len(day_orders),
                       "revenue_eur": round(sum(float(o.charge_total or 0) if o.charge_currency == "EUR" else 0 for o in day_orders), 2)})

    prod_res = await db.execute(select(Product).options(selectinload(Product.variants)).where(Product.published == True))
    products = prod_res.scalars().unique().all()
    out_of_stock = [{"id": p.id, "name": p.name_fr, "slug": p.slug} for p in products if sum(v.stock for v in p.variants) == 0]
    low_stock = [{"id": p.id, "name": p.name_fr, "slug": p.slug, "stock": sum(v.stock for v in p.variants)}
                 for p in products if 0 < sum(v.stock for v in p.variants) <= 5]
    best_sellers = sorted(products, key=lambda p: p.sales_count or 0, reverse=True)[:5]
    customers = (await db.execute(select(func.count(Profile.id)).where(Profile.role == "customer"))).scalar() or 0
    emails_failed = (await db.execute(select(func.count(EmailLog.id)).where(EmailLog.status == "failed"))).scalar() or 0
    promos_active = (await db.execute(select(func.count(PromoCode.id)).where(PromoCode.active == True))).scalar() or 0
    pending_cancellations = len([o for o in orders if o.status == "cancellation_requested"])

    return {
        "total_orders": len(orders),
        "paid_orders": len(paid),
        "revenue_by_currency": {k: round(v, 2) for k, v in revenue_by_currency.items()},
        "revenue_30d": {k: round(v, 2) for k, v in revenue_30d.items()},
        "pending_payments": len([o for o in orders if o.payment_status == "pending"]),
        "orders_to_process": len([o for o in orders if o.status in ("paid", "preparing")]),
        "orders_shipped": len([o for o in orders if o.status in ("shipped", "in_transit")]),
        "pending_cancellations": pending_cancellations,
        "by_status": by_status,
        "series": series,
        "total_products": len(products),
        "customers": customers,
        "out_of_stock": len(out_of_stock),
        "out_of_stock_items": out_of_stock[:10],
        "low_stock": low_stock,
        "best_sellers": [{"id": p.id, "name": p.name_fr, "slug": p.slug, "sales": p.sales_count or 0} for p in best_sellers],
        "recent_orders": [o.to_dict() for o in orders[:8]],
        "emails_enabled": emails_enabled(),
        "emails_failed": emails_failed,
        "promos_active": promos_active,
    }


# ---------------- Products ----------------
class VariantIn(BaseModel):
    id: Optional[str] = None
    size: str = ""
    color: str = ""
    sku: str = ""
    stock: int = 0
    extra_price_eur: float = 0


class ProductIn(BaseModel):
    slug: str
    sku: str = ""
    brand_id: Optional[str] = None
    category_id: Optional[str] = None
    name_fr: str
    name_en: str
    description_fr: str = ""
    description_en: str = ""
    price_eur: float
    price_usd: Optional[float] = None
    price_xof: Optional[float] = None
    sale_price_eur: Optional[float] = None
    is_new: bool = False
    is_featured: bool = False
    is_best_seller: bool = False
    gender: str = ""
    sport: str = ""
    club: str = ""
    national_team: str = ""
    surface: str = ""
    product_type: str = ""
    colors: list = []
    customizable: bool = False
    customization_price_eur: float = 0
    customization_fields: list = []
    cta_label: str = ""
    cod_allowed: bool = True
    video_url: str = ""
    published: bool = True
    images: list[str] = []
    variants: list[VariantIn] = []


@router.get("/products")
async def admin_list_products(db: AsyncSession = Depends(get_db)):
    rates = await get_rates(db)
    res = await db.execute(select(Product).options(
        selectinload(Product.brand), selectinload(Product.category),
        selectinload(Product.images), selectinload(Product.variants)).order_by(Product.created_at.desc()))
    return [serialize_product(p, rates, full=True) for p in res.scalars().unique().all()]


def _clean_customization_fields(fields: list) -> list:
    VALID_TYPES = {"text", "textarea", "number", "select", "color", "date"}
    cleaned = []
    seen_keys = set()

    for f in (fields or []):
        if not isinstance(f, dict):
            continue
        key = (f.get("key") or "").strip().lower()
        key = "".join(c for c in key if c.isalnum() or c in "-_")
        if not key or key in seen_keys:
            continue
        seen_keys.add(key)

        typ = (f.get("type") or "text").strip().lower()
        if typ not in VALID_TYPES:
            typ = "text"

        try:
            price = max(0.0, float(f.get("price_eur") or 0))
        except (TypeError, ValueError):
            price = 0.0

        try:
            max_len = max(1, int(f.get("max_length") or 200))
        except (TypeError, ValueError):
            max_len = 200

        cleaned_options = []
        if typ == "select":
            for o in (f.get("options") or []):
                if not isinstance(o, dict):
                    continue
                oval = (o.get("value") or "").strip().lower()
                oval = "".join(c for c in oval if c.isalnum() or c in "-_")
                if not oval:
                    continue
                try:
                    oprice = max(0.0, float(o.get("price_eur") or 0))
                except (TypeError, ValueError):
                    oprice = 0.0
                cleaned_options.append({
                    "value": oval,
                    "label_fr": (o.get("label_fr") or "").strip(),
                    "label_en": (o.get("label_en") or "").strip(),
                    "price_eur": oprice,
                })

        cleaned.append({
            "key": key,
            "type": typ,
            "label_fr": (f.get("label_fr") or "").strip(),
            "label_en": (f.get("label_en") or "").strip(),
            "placeholder_fr": (f.get("placeholder_fr") or "").strip(),
            "placeholder_en": (f.get("placeholder_en") or "").strip(),
            "required": bool(f.get("required", False)),
            "max_length": max_len,
            "price_eur": price,
            "default_value": (f.get("default_value") or ""),
            "options": cleaned_options,
        })
    return cleaned


_VALID_CTA_LABELS = {"", "auto", "add_to_cart", "choose", "customize", "order", "view"}


def _clean_cta_label(raw: str) -> str:
    v = (raw or "").strip().lower()[:40]
    return v if v in _VALID_CTA_LABELS else ""


def _product_fields(data: ProductIn):
    d = {k: v for k, v in data.model_dump().items() if k not in ("images", "variants")}
    d["video_url"] = normalize_media(d.get("video_url", ""))
    d["slug"] = d["slug"].strip().lower()
    d["customization_fields"] = _clean_customization_fields(d.get("customization_fields") or [])
    d["cta_label"] = _clean_cta_label(d.get("cta_label", ""))
    return d


@router.post("/products")
async def create_product(data: ProductIn, db: AsyncSession = Depends(get_db)):
    fields = _product_fields(data)
    exists = await db.execute(select(Product).where(Product.slug == fields["slug"]))
    if exists.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Un produit avec ce slug existe deja")
    p = Product(**fields)
    db.add(p)
    await db.flush()
    for i, url in enumerate(data.images):
        db.add(ProductImage(product_id=p.id, url=normalize_media(url), position=i))
    for v in data.variants:
        db.add(ProductVariant(product_id=p.id, size=v.size, color=v.color, sku=v.sku,
                              stock=v.stock, extra_price_eur=v.extra_price_eur))
    await db.commit()
    await bump_cache_version(db)
    return {"id": p.id, "ok": True}


@router.put("/products/{product_id}")
async def update_product(product_id: str, data: ProductIn, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Product).where(Product.id == product_id)
                           .options(selectinload(Product.images), selectinload(Product.variants)))
    p = res.scalars().unique().one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    fields = _product_fields(data)
    dup = await db.execute(select(Product).where(Product.slug == fields["slug"], Product.id != product_id))
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Un autre produit utilise deja ce slug")
    for k, v in fields.items():
        setattr(p, k, v)
    for img in list(p.images):
        await db.delete(img)
    for i, url in enumerate(data.images):
        db.add(ProductImage(product_id=p.id, url=normalize_media(url), position=i))
    existing_ids = {v.id for v in p.variants}
    incoming_ids = {v.id for v in data.variants if v.id}
    for var in list(p.variants):
        if var.id not in incoming_ids:
            await db.delete(var)
    for v in data.variants:
        if v.id and v.id in existing_ids:
            var = next(x for x in p.variants if x.id == v.id)
            var.size, var.color, var.sku, var.stock, var.extra_price_eur = v.size, v.color, v.sku, v.stock, v.extra_price_eur
        else:
            db.add(ProductVariant(product_id=p.id, size=v.size, color=v.color, sku=v.sku,
                                  stock=v.stock, extra_price_eur=v.extra_price_eur))
    await db.commit()
    await bump_cache_version(db)
    return {"ok": True}


@router.put("/products/{product_id}/publish")
async def toggle_publish(product_id: str, data: dict, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Product).where(Product.id == product_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    p.published = bool(data.get("published", True))
    await db.commit()
    await bump_cache_version(db)
    return {"ok": True, "published": p.published}


@router.delete("/products/{product_id}")
async def delete_product(product_id: str, hard: bool = False, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Product).where(Product.id == product_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    if hard:
        await db.delete(p)
    else:
        p.published = False
    await db.commit()
    await bump_cache_version(db)
    return {"ok": True, "hard": hard}


@router.post("/products/{product_id}/duplicate")
async def duplicate_product(product_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Product).where(Product.id == product_id)
                           .options(selectinload(Product.images), selectinload(Product.variants)))
    p = res.scalars().unique().one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    base_slug = f"{p.slug}-copie"
    slug, i = base_slug, 2
    while (await db.execute(select(Product).where(Product.slug == slug))).scalar_one_or_none():
        slug = f"{base_slug}-{i}"; i += 1
    copy_fields = {c.name: getattr(p, c.name) for c in Product.__table__.columns
                   if c.name not in ("id", "slug", "created_at", "sales_count", "published")}
    np = Product(**copy_fields, slug=slug, published=False)
    db.add(np)
    await db.flush()
    for img in p.images:
        db.add(ProductImage(product_id=np.id, url=img.url, position=img.position))
    for v in p.variants:
        db.add(ProductVariant(product_id=np.id, size=v.size, color=v.color, sku=v.sku, stock=0, extra_price_eur=v.extra_price_eur))
    await db.commit()
    await bump_cache_version(db)
    return {"ok": True, "id": np.id, "slug": slug}


class StockAdjust(BaseModel):
    variant_id: str
    stock: int


@router.post("/stock/adjust")
async def adjust_stock(data: StockAdjust, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(ProductVariant).where(ProductVariant.id == data.variant_id))
    v = res.scalar_one_or_none()
    if not v:
        raise HTTPException(status_code=404, detail="Variante introuvable")
    v.stock = max(0, data.stock)
    await db.commit()
    await bump_cache_version(db)
    return {"ok": True, "stock": v.stock}


# ---------------- Brands ----------------
class BrandIn(BaseModel):
    name: str
    slug: str
    logo_url: str = ""
    description_fr: str = ""
    description_en: str = ""
    is_local: bool = False
    published: bool = True


@router.get("/brands")
async def admin_brands(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Brand).order_by(Brand.name))
    brands = res.scalars().all()
    counts = dict((await db.execute(select(Product.brand_id, func.count(Product.id)).group_by(Product.brand_id))).all())
    return [{**b.to_dict(), "product_count": counts.get(b.id, 0)} for b in brands]


@router.post("/brands")
async def create_brand(data: BrandIn, db: AsyncSession = Depends(get_db)):
    if (await db.execute(select(Brand).where(Brand.slug == data.slug))).scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Slug deja utilise")
    b = Brand(**{**data.model_dump(), "logo_url": normalize_media(data.logo_url)})
    db.add(b)
    await db.commit()
    await bump_cache_version(db)
    return {"ok": True, "id": b.id}


@router.put("/brands/{brand_id}")
async def update_brand(brand_id: str, data: BrandIn, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Brand).where(Brand.id == brand_id))
    b = res.scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="Marque introuvable")
    for k, v in data.model_dump().items():
        setattr(b, k, normalize_media(v) if k == "logo_url" else v)
    await db.commit()
    await bump_cache_version(db)
    return {"ok": True}


@router.delete("/brands/{brand_id}")
async def delete_brand(brand_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Brand).where(Brand.id == brand_id))
    b = res.scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="Marque introuvable")
    await db.delete(b)
    await db.commit()
    await bump_cache_version(db)
    return {"ok": True}


# ---------------- Categories ----------------
class CategoryIn(BaseModel):
    slug: str
    name_fr: str
    name_en: str
    type: str = ""
    parent_id: Optional[str] = None
    position: int = 0
    published: bool = True


# ⭐ CORRIGÉ : le product_count inclut désormais les produits des sous-catégories
@router.get("/categories")
async def admin_categories(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Category).order_by(Category.position))
    cats = res.scalars().all()

    # 1. Compte les produits directement liés à chaque catégorie
    direct_counts = dict((await db.execute(
        select(Product.category_id, func.count(Product.id)).group_by(Product.category_id)
    )).all())

    # 2. Calcul du total (catégorie + sous-catégories)
    total_counts = {}
    for c in cats:
        count = direct_counts.get(c.id, 0)
        for child in cats:
            if child.parent_id == c.id:
                count += direct_counts.get(child.id, 0)
        total_counts[c.id] = count

    return [{**c.to_dict(), "product_count": total_counts.get(c.id, 0)} for c in cats]


@router.post("/categories")
async def create_category(data: CategoryIn, db: AsyncSession = Depends(get_db)):
    if (await db.execute(select(Category).where(Category.slug == data.slug))).scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Slug deja utilise")
    c = Category(**data.model_dump())
    db.add(c)
    await db.commit()
    await bump_cache_version(db)
    return {"ok": True, "id": c.id}


@router.put("/categories/{category_id}")
async def update_category(category_id: str, data: CategoryIn, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Category).where(Category.id == category_id))
    c = res.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Categorie introuvable")
    for k, v in data.model_dump().items():
        setattr(c, k, v)
    await db.commit()
    await bump_cache_version(db)
    return {"ok": True}


@router.delete("/categories/{category_id}")
async def delete_category(category_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Category).where(Category.id == category_id))
    c = res.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Categorie introuvable")
    await db.delete(c)
    await db.commit()
    await bump_cache_version(db)
    return {"ok": True}


# ---------------- Orders ----------------
VALID_STATUSES = ["pending_payment", "paid", "preparing", "shipped", "in_transit",
                  "delivered", "cancelled", "return_requested", "return_approved",
                  "return_shipped", "return_received", "returned", "refunded",
                  "exchange_sent", "cancellation_requested"]


@router.get("/orders/counts")
async def admin_orders_counts(db: AsyncSession = Depends(get_db)):
    from sqlalchemy import func as _f
    res = await db.execute(select(Order.status, _f.count(Order.id)).group_by(Order.status))
    by_status = {s: c for s, c in res.all()}

    def sum_statuses(keys):
        return sum(by_status.get(k, 0) for k in keys)

    total = sum(by_status.values())
    return {
        "total": total,
        "to_process": sum_statuses(["paid", "preparing"]),
        "in_transit": sum_statuses(["shipped", "in_transit"]),
        "returns": sum_statuses(["return_requested", "return_approved", "return_shipped", "return_received"]),
        "cancellations": sum_statuses(["cancellation_requested"]),
        "delivered": sum_statuses(["delivered"]),
        "completed": sum_statuses(["returned", "refunded", "cancelled", "exchange_sent"]),
        "by_status": by_status,
    }


@router.get("/orders")
async def admin_orders(status: Optional[str] = None, payment_status: Optional[str] = None,
                       q: Optional[str] = None, country: Optional[str] = None,
                       period: Optional[str] = None, sort: str = "recent",
                       scheduled: Optional[str] = None,
                       limit: int = 200, db: AsyncSession = Depends(get_db)):
    query = select(Order)
    query = query.limit(min(limit, 500))

    if status:
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        if len(statuses) == 1:
            query = query.where(Order.status == statuses[0])
        else:
            query = query.where(Order.status.in_(statuses))

    if payment_status:
        query = query.where(Order.payment_status == payment_status)

    if q:
        term = f"%{q.strip()}%"
        query = query.where(or_(Order.order_number.ilike(term), Order.email.ilike(term),
                                Order.first_name.ilike(term), Order.last_name.ilike(term),
                                Order.tracking_number.ilike(term)))

    if country:
        query = query.where(Order.shipping_address["country"].astext == country.upper())

    if period and period != "all":
        days = {"7d": 7, "30d": 30, "90d": 90}.get(period, 30)
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        query = query.where(Order.created_at >= cutoff)

    if scheduled == "upcoming":
        query = query.where(Order.scheduled_date.isnot(None))
        query = query.where(Order.scheduled_date >= datetime.now(timezone.utc).date())
    elif scheduled == "all":
        query = query.where(Order.scheduled_date.isnot(None))

    if sort == "scheduled":
        query = query.order_by(Order.scheduled_date.asc().nullslast())
    elif sort == "oldest":
        query = query.order_by(Order.created_at.asc())
    elif sort == "amount_desc":
        query = query.order_by(Order.total.desc())
    elif sort == "amount_asc":
        query = query.order_by(Order.total.asc())
    else:
        query = query.order_by(Order.created_at.desc())

    res = await db.execute(query)
    return [o.to_dict() for o in res.scalars().all()]


async def _get_order(db, order_id):
    res = await db.execute(select(Order).where(Order.id == order_id))
    o = res.scalar_one_or_none()
    if not o:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    return o


@router.get("/orders/{order_id}")
async def admin_order_detail(order_id: str, db: AsyncSession = Depends(get_db)):
    o = await _get_order(db, order_id)
    pays = await db.execute(select(Payment).where(Payment.order_id == o.id).order_by(Payment.created_at.desc()))
    logs = await db.execute(select(EmailLog).where(EmailLog.order_id == o.id).order_by(EmailLog.created_at.desc()))
    return {**o.to_dict(), "payments": [p.to_dict() for p in pays.scalars().all()],
            "emails": [e.to_dict() for e in logs.scalars().all()]}


class OrderStatusIn(BaseModel):
    status: str
    note: str = ""
    notify: bool = True


@router.put("/orders/{order_id}/status")
async def update_order_status(order_id: str, data: OrderStatusIn, admin=Depends(get_current_admin),
                              db: AsyncSession = Depends(get_db)):
    if data.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Statut invalide")
    o = await _get_order(db, order_id)
    if o.status == data.status:
        return {"ok": True, "unchanged": True}
    o.status = data.status
    now = datetime.now(timezone.utc)
    if data.status == "shipped" and not o.shipped_at:
        o.shipped_at = now
        if not o.delivery_otp:
            otp = f"{random.randint(0, 999999):06d}"
            o.delivery_otp = otp
            o.delivery_otp_expires_at = now + timedelta(days=7)
            o.delivery_otp_attempts = 0
            o.delivery_otp_locked = False
            o.driver_assigned_at = now
    if data.status == "delivered":
        o.delivered_at = now
    if data.status == "refunded":
        o.payment_status = "refunded"
    push_history(o, data.status, by=admin.email, note=data.note)
    await db.commit()
    email_log = None
    if data.notify and o.email:
        if data.status == "shipped":
            email_log = await send_order_email(db, o, "order_shipped")
        elif data.status == "delivered":
            email_log = await send_order_email(db, o, "order_delivered")
        elif data.status in ("cancelled", "refunded"):
            email_log = await send_order_email(db, o, "order_cancelled", refunded=(data.status == "refunded"))

    if data.status == "shipped" and o.delivery_otp and o.email:
        try:
            from emails import tpl_delivery_otp_client
            lang = o.lang if o.lang in ("fr", "en") else "fr"
            subject, html = tpl_delivery_otp_client(o.to_dict(), o.delivery_otp, lang)
            await send_templated(db, to=o.email, subject=subject, html=html,
                                 template="delivery_otp", order_id=o.id)
        except Exception:
            pass

    return {"ok": True, "email": email_log.to_dict() if email_log else None}


class SegmentIn(BaseModel):
    carrier: str = ""
    tracking_number: str = ""
    tracking_url: str = ""
    status: str = "pending"
    note: str = ""


class TrackingIn(BaseModel):
    tracking_carrier: str = ""
    tracking_number: str = ""
    tracking_url: str = ""
    mark_shipped: bool = True
    notify: bool = True
    shipping_origin_country: str = ""
    segments: list[SegmentIn] = []


@router.put("/orders/{order_id}/tracking")
async def update_tracking(order_id: str, data: TrackingIn, admin=Depends(get_current_admin),
                          db: AsyncSession = Depends(get_db)):
    from utils import carrier_url

    o = await _get_order(db, order_id)

    if data.segments:
        segments = []
        for s in data.segments:
            carrier = (s.carrier or "").strip()
            num = (s.tracking_number or "").strip()
            url = (s.tracking_url or "").strip()
            if not url and carrier and num:
                url = carrier_url(carrier, num)
            if url and not url.lower().startswith("https://"):
                raise HTTPException(status_code=400, detail="Le lien de suivi doit commencer par https://")
            segments.append({
                "carrier": carrier,
                "tracking_number": num,
                "tracking_url": url,
                "status": s.status if s.status in ("pending", "in_transit", "delivered", "failed") else "pending",
                "note": (s.note or "").strip()[:200],
                "at": datetime.now(timezone.utc).isoformat(),
            })
        o.shipping_segments = segments
        if segments:
            first = segments[0]
            o.tracking_carrier = first["carrier"]
            o.tracking_number = first["tracking_number"]
            o.tracking_url = first["tracking_url"]

    else:
        url = data.tracking_url.strip()
        if url and not url.lower().startswith("https://"):
            raise HTTPException(status_code=400, detail="Le lien de suivi doit commencer par https://")
        o.tracking_carrier = data.tracking_carrier.strip()
        o.tracking_number = data.tracking_number.strip()
        o.tracking_url = url

    if data.shipping_origin_country:
        o.shipping_origin_country = data.shipping_origin_country.strip().upper()

    sent = None
    if data.mark_shipped and o.status in ("paid", "preparing"):
        o.status = "shipped"
        o.shipped_at = datetime.now(timezone.utc)
        if not o.delivery_otp:
            otp = f"{random.randint(0, 999999):06d}"
            o.delivery_otp = otp
            o.delivery_otp_expires_at = datetime.now(timezone.utc) + timedelta(days=7)
            o.delivery_otp_attempts = 0
            o.delivery_otp_locked = False
            o.driver_assigned_at = datetime.now(timezone.utc)
        note = f"{o.tracking_carrier} {o.tracking_number}".strip()
        if data.segments and len(data.segments) > 1:
            note = f"{len(data.segments)} segments d'expedition"
        push_history(o, "shipped", by=admin.email, note=note)
        await db.commit()
        if data.notify and o.email:
            sent = await send_order_email(db, o, "order_shipped")
        if o.delivery_otp and o.email:
            try:
                from emails import tpl_delivery_otp_client
                lang = o.lang if o.lang in ("fr", "en") else "fr"
                subject, html = tpl_delivery_otp_client(o.to_dict(), o.delivery_otp, lang)
                await send_templated(db, to=o.email, subject=subject, html=html,
                                     template="delivery_otp", order_id=o.id)
            except Exception:
                pass
    else:
        note = f"Suivi mis a jour: {o.tracking_carrier} {o.tracking_number}".strip()
        if data.segments:
            note = f"Suivi mis a jour ({len(data.segments)} segment(s))"
        push_history(o, o.status, by=admin.email, note=note)
        await db.commit()
        if data.notify and o.email and o.status in ("shipped", "in_transit"):
            sent = await send_order_email(db, o, "order_shipped")
    return {"ok": True, "order": o.to_dict(), "email": sent.to_dict() if sent else None}


class SegmentStatusIn(BaseModel):
    index: int
    status: str
    note: str = ""
    notify: bool = True


@router.put("/orders/{order_id}/segments/{index}/status")
async def update_segment_status(order_id: str, index: int, data: SegmentStatusIn,
                                admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    if data.status not in ("pending", "in_transit", "delivered", "failed"):
        raise HTTPException(status_code=400, detail="Statut invalide.")

    o = await _get_order(db, order_id)
    segs = list(o.shipping_segments or [])
    if index < 0 or index >= len(segs):
        raise HTTPException(status_code=404, detail="Segment introuvable.")
    segs[index]["status"] = data.status
    segs[index]["note"] = (data.note or "").strip()[:200]
    segs[index]["at"] = datetime.now(timezone.utc).isoformat()
    o.shipping_segments = segs

    if all(s.get("status") == "delivered" for s in segs):
        if o.status not in ("delivered", "refunded", "cancelled", "returned"):
            o.status = "delivered"
            o.delivered_at = datetime.now(timezone.utc)
            push_history(o, "delivered", by=admin.email, note="Tous les segments livres")
            await db.commit()
            if data.notify and o.email:
                await send_order_email(db, o, "order_delivered")
            return {"ok": True, "order": o.to_dict()}

    push_history(o, o.status, by=admin.email,
                 note=f"Segment {index + 1} : {data.status}")
    await db.commit()
    return {"ok": True, "order": o.to_dict()}


class NotesIn(BaseModel):
    admin_notes: str = ""


@router.put("/orders/{order_id}/notes")
async def update_notes(order_id: str, data: NotesIn, db: AsyncSession = Depends(get_db)):
    o = await _get_order(db, order_id)
    o.admin_notes = data.admin_notes
    await db.commit()
    return {"ok": True}


class ResendIn(BaseModel):
    template: str


@router.post("/orders/{order_id}/resend-email")
async def resend_email(order_id: str, data: ResendIn, db: AsyncSession = Depends(get_db)):
    if data.template not in ("order_confirmed", "order_shipped", "order_delivered"):
        raise HTTPException(status_code=400, detail="Template invalide")
    o = await _get_order(db, order_id)
    if not o.email:
        raise HTTPException(status_code=400, detail="Commande sans e-mail")
    log = await send_order_email(db, o, data.template)
    if log.status == "failed":
        raise HTTPException(status_code=502, detail=f"Envoi echoue: {log.error[:200]}")
    if log.status == "disabled":
        raise HTTPException(status_code=409, detail="Envoi d'e-mails desactive (EMAILS_ENABLED)")
    return {"ok": True, "email": log.to_dict()}


class RefundIn(BaseModel):
    amount: Optional[float] = None
    notify: bool = True
    message: str = ""


@router.post("/orders/{order_id}/refund")
async def refund_order(order_id: str, data: RefundIn, admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    o = await _get_order(db, order_id)
    if o.payment_status != "paid":
        raise HTTPException(status_code=400, detail="Seule une commande payee peut etre remboursee")

    o.refund_message = (data.message or "").strip()[:1000]

    pres = await db.execute(
        select(Payment).where(
            Payment.order_id == o.id,
            Payment.status.in_(["succeeded", "pending"])
        ).order_by(Payment.created_at.desc())
    )
    pay = pres.scalars().first()
    if not pay:
        raise HTTPException(status_code=400, detail="Aucun paiement Stripe confirme pour cette commande")
    pi = pay.payment_intent
    if not pi:
        try:
            s = stripe.checkout.Session.retrieve(pay.session_id)
            pi = s.payment_intent
        except stripe.error.StripeError as e:
            raise HTTPException(status_code=502, detail=f"Stripe: {e.user_message or str(e)}")
    kwargs = {"payment_intent": pi}
    if data.amount is not None:
        kwargs["amount"] = int(round(float(data.amount) * 100))
    try:
        refund = stripe.Refund.create(**kwargs)
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=502, detail=f"Stripe: {e.user_message or str(e)}")
    full = data.amount is None or abs(float(data.amount) - float(pay.amount or 0)) < 0.005
    pay.status = "refunded" if full else "partially_refunded"
    pay.payment_intent = pi
    pay.raw_event = {"refund_id": refund.id, "amount": refund.amount, "status": refund.status}
    if full:
        o.payment_status = "refunded"
        o.status = "refunded"
    push_history(o, o.status, by=admin.email, note=f"Remboursement Stripe {refund.id} ({refund.amount / 100:.2f} {o.charge_currency})")
    await db.commit()
    if data.notify and full and o.email:
        await send_order_email(db, o, "order_refunded")
    return {"ok": True, "refund_id": refund.id, "full": full, "order": o.to_dict()}


@router.post("/orders/{order_id}/approve-cancellation")
async def approve_cancellation(order_id: str, admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    o = await _get_order(db, order_id)
    if o.status != "cancellation_requested":
        raise HTTPException(status_code=400, detail="Aucune demande d'annulation en cours.")

    pres = await db.execute(
        select(Payment).where(
            Payment.order_id == o.id,
            Payment.status.in_(["succeeded", "pending"])
        ).order_by(Payment.created_at.desc())
    )
    pay = pres.scalars().first()
    if pay:
        pi = pay.payment_intent
        if not pi and pay.session_id:
            try:
                s = stripe.checkout.Session.retrieve(pay.session_id)
                pi = s.payment_intent
            except stripe.error.StripeError:
                pi = None
        if pi:
            try:
                refund = stripe.Refund.create(payment_intent=pi)
                pay.status = "refunded"
                pay.payment_intent = pi
                pay.raw_event = {"refund_id": refund.id, "amount": refund.amount, "status": refund.status}
            except stripe.error.StripeError as e:
                raise HTTPException(status_code=502, detail=f"Stripe refund: {e.user_message or str(e)}")

    o.status = "cancelled"
    o.payment_status = "refunded"
    o.cancellation_decided_at = datetime.now(timezone.utc)
    push_history(o, "cancelled", by=admin.email, note=f"Annulation validee : {o.cancellation_reason[:100]}")
    await db.commit()

    try:
        lang = o.lang if o.lang in ("fr", "en") else "fr"
        subject, html = tpl_cancellation_approved(o.to_dict(), lang)
        await send_templated(db, to=o.email, subject=subject, html=html,
                             template="cancellation_approved", order_id=o.id)
    except Exception:
        pass

    return {"ok": True, "status": o.status, "payment_status": o.payment_status}


@router.post("/orders/{order_id}/refuse-cancellation")
async def refuse_cancellation(order_id: str, data: dict, admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    o = await _get_order(db, order_id)
    if o.status != "cancellation_requested":
        raise HTTPException(status_code=400, detail="Aucune demande d'annulation en cours.")

    reason = (data.get("reason") or "").strip()[:500]
    o.status = "paid"
    o.cancellation_refused_reason = reason
    o.cancellation_decided_at = datetime.now(timezone.utc)
    push_history(o, "paid", by=admin.email, note=f"Annulation refusee : {reason[:100]}")
    await db.commit()

    try:
        lang = o.lang if o.lang in ("fr", "en") else "fr"
        subject, html = tpl_cancellation_refused(o.to_dict(), lang)
        await send_templated(db, to=o.email, subject=subject, html=html,
                             template="cancellation_refused", order_id=o.id)
    except Exception:
        pass

    return {"ok": True, "status": o.status}


@router.delete("/orders/{order_id}")
async def delete_order(order_id: str, db: AsyncSession = Depends(get_db)):
    o = await _get_order(db, order_id)
    await db.delete(o)
    await db.commit()
    return {"ok": True}


@router.get("/payments")
async def admin_payments(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Payment).order_by(Payment.created_at.desc()).limit(300))
    return [p.to_dict() for p in res.scalars().all()]


# ---------------- Customers ----------------
@router.get("/customers")
async def admin_customers(q: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    query = select(Profile).order_by(Profile.created_at.desc()).limit(500)
    if q:
        term = f"%{q.strip()}%"
        query = query.where(or_(Profile.email.ilike(term), Profile.first_name.ilike(term), Profile.last_name.ilike(term)))
    res = await db.execute(query)
    users = res.scalars().all()
    stats = (await db.execute(
        select(Order.user_id, func.count(Order.id), func.sum(Order.charge_total))
        .where(Order.payment_status == "paid").group_by(Order.user_id))).all()
    smap = {uid: (cnt, float(total or 0)) for uid, cnt, total in stats}
    return [{**u.to_dict(), "orders_count": smap.get(u.id, (0, 0))[0], "spent_eur": round(smap.get(u.id, (0, 0))[1], 2)} for u in users]


@router.get("/customers/{user_id}")
async def admin_customer_detail(user_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Profile).where(Profile.id == user_id).options(selectinload(Profile.addresses)))
    u = res.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="Client introuvable")
    ores = await db.execute(select(Order).where(Order.user_id == u.id).order_by(Order.created_at.desc()))
    return {**u.to_dict(), "addresses": [a.to_dict() for a in u.addresses], "orders": [o.to_dict() for o in ores.scalars().all()]}


class RoleIn(BaseModel):
    role: str


@router.put("/customers/{user_id}/role")
async def set_role(user_id: str, data: RoleIn, admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    if data.role not in ("customer", "admin"):
        raise HTTPException(status_code=400, detail="Role invalide")
    if user_id == admin.id and data.role != "admin":
        raise HTTPException(status_code=400, detail="Impossible de retirer votre propre role admin")
    res = await db.execute(select(Profile).where(Profile.id == user_id))
    u = res.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="Client introuvable")
    u.role = data.role
    await db.commit()
    return {"ok": True}


@router.delete("/customers/{user_id}")
async def delete_customer(user_id: str, admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Impossible de supprimer votre propre compte")
    res = await db.execute(select(Profile).where(Profile.id == user_id))
    u = res.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="Client introuvable")
    await db.delete(u)
    await db.commit()
    return {"ok": True}


# ---------------- Promo codes ----------------
class PromoIn(BaseModel):
    code: str
    description: str = ""
    discount_type: str = "percent"
    value: float = 0
    min_subtotal_eur: float = 0
    free_shipping: bool = False
    first_order_only: bool = False
    usage_limit: Optional[int] = None
    starts_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    active: bool = True


def _validate_promo(data: PromoIn):
    if data.discount_type not in ("percent", "fixed"):
        raise HTTPException(status_code=400, detail="Type invalide (percent|fixed)")
    if data.discount_type == "percent" and not (0 <= data.value <= 100):
        raise HTTPException(status_code=400, detail="Pourcentage entre 0 et 100")
    if data.value < 0:
        raise HTTPException(status_code=400, detail="Valeur invalide")
    if not data.code.strip():
        raise HTTPException(status_code=400, detail="Code requis")


@router.get("/promos")
async def list_promos(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(PromoCode).order_by(PromoCode.created_at.desc()))
    return [p.to_dict() for p in res.scalars().all()]


@router.post("/promos")
async def create_promo(data: PromoIn, db: AsyncSession = Depends(get_db)):
    _validate_promo(data)
    code = data.code.strip().upper()
    if (await db.execute(select(PromoCode).where(PromoCode.code == code))).scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ce code existe deja")
    p = PromoCode(**{**data.model_dump(), "code": code})
    db.add(p)
    await db.commit()
    await bump_cache_version(db)
    return {"ok": True, "id": p.id}


@router.put("/promos/{promo_id}")
async def update_promo(promo_id: str, data: PromoIn, db: AsyncSession = Depends(get_db)):
    _validate_promo(data)
    res = await db.execute(select(PromoCode).where(PromoCode.id == promo_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Code introuvable")
    code = data.code.strip().upper()
    dup = await db.execute(select(PromoCode).where(PromoCode.code == code, PromoCode.id != promo_id))
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ce code existe deja")
    for k, v in data.model_dump().items():
        setattr(p, k, code if k == "code" else v)
    await db.commit()
    await bump_cache_version(db)
    return {"ok": True}


@router.delete("/promos/{promo_id}")
async def delete_promo(promo_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(PromoCode).where(PromoCode.id == promo_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Code introuvable")
    await db.delete(p)
    await db.commit()
    await bump_cache_version(db)
    return {"ok": True}


# ---------------- Email logs ----------------
@router.get("/emails")
async def list_emails(status: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    q = select(EmailLog).order_by(EmailLog.created_at.desc()).limit(300)
    if status:
        q = q.where(EmailLog.status == status)
    res = await db.execute(q)
    return {"enabled": emails_enabled(), "from_name": EMAIL_FROM_NAME, "reply_to": EMAIL_REPLY_TO,
            "admin_notify": ADMIN_NOTIFY_EMAIL, "logs": [e.to_dict() for e in res.scalars().all()]}


@router.delete("/emails/{log_id}")
async def delete_email(log_id: str, db: AsyncSession = Depends(get_db)):
    log = (await db.execute(select(EmailLog).where(EmailLog.id == log_id))).scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="E-mail introuvable")
    await db.delete(log)
    await db.commit()
    return {"ok": True}


@router.delete("/emails")
async def clear_emails(status: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    q = delete(EmailLog)
    if status:
        q = q.where(EmailLog.status == status)
    result = await db.execute(q)
    await db.commit()
    return {"ok": True, "deleted": result.rowcount or 0}


# ---------------- Settings ----------------
@router.get("/settings")
async def admin_get_settings(db: AsyncSession = Depends(get_db)):
    return await get_settings(db)


class SettingIn(BaseModel):
    key: str
    value: Any


ALLOWED_SETTING_KEYS = {
    "currency", "info_bar", "hero", "sections", "icons", "shipping",
    "site", "payment_providers", "taxonomies", "cart_reminders",
    "features", "testimonials",
    "cta_banner", "story", "steps", "gallery",
    "orders",
    "payment_methods",
}


@router.put("/settings")
async def admin_update_setting(data: SettingIn, db: AsyncSession = Depends(get_db)):
    if data.key not in ALLOWED_SETTING_KEYS:
        raise HTTPException(status_code=400, detail="Cle de parametre inconnue")
    value = data.value
    if data.key == "hero" and isinstance(value, dict):
        value = {**value, "slides": [{**sl, "video_url": normalize_media(sl.get("video_url", "")), "image_url": normalize_media(sl.get("image_url", ""))}
                                     for sl in (value.get("slides") or [])]}
    if data.key == "icons" and isinstance(value, dict):
        value = {**value, "items": [{**it, "image_url": normalize_media(it.get("image_url", ""))} for it in (value.get("items") or [])]}
    if data.key == "sections" and isinstance(value, dict):
        value = {k: {**v, "video_url": normalize_media(v.get("video_url", "")), "image_url": normalize_media(v.get("image_url", "")),
                     "cards": [{**c, "video_url": normalize_media(c.get("video_url", "")), "image_url": normalize_media(c.get("image_url", ""))} for c in (v.get("cards") or [])]}
                 for k, v in value.items()}
    if data.key == "taxonomies" and isinstance(value, dict):
        def _clean_items(items):
            return [{**it,
                     "value": (it.get("value") or "").strip().lower(),
                     "name_fr": (it.get("name_fr") or "").strip(),
                     "name_en": (it.get("name_en") or "").strip(),
                     "image_url": normalize_media(it.get("image_url", ""))}
                    for it in (items or [])]
        value = {
            "genders": _clean_items(value.get("genders")),
            "sports": _clean_items(value.get("sports")),
            "teams": _clean_items(value.get("teams")),
            "clubs": _clean_items(value.get("clubs")),
        }
    if data.key == "cta_banner" and isinstance(value, dict):
        value = {
            **value,
            "image_url": normalize_media(value.get("image_url", "")),
            "video_url": normalize_media(value.get("video_url", "")),
        }
    if data.key == "story" and isinstance(value, dict):
        value = {**value, "image_url": normalize_media(value.get("image_url", ""))}
    if data.key == "gallery" and isinstance(value, dict):
        value = {
            **value,
            "items": [
                {**it, "image_url": normalize_media(it.get("image_url", ""))}
                for it in (value.get("items") or [])
            ],
        }
    if data.key == "orders" and isinstance(value, dict):
        try:
            value = {
                **value,
                "min_lead_hours": max(0, int(value.get("min_lead_hours", 48))),
                "max_advance_days": max(1, int(value.get("max_advance_days", 180))),
                "claim_window_hours": max(1, int(value.get("claim_window_hours", 48))),
                "claim_media_max_photos": max(1, int(value.get("claim_media_max_photos", 3))),
                "claim_media_max_videos": max(0, int(value.get("claim_media_max_videos", 1))),
                "claim_media_max_photo_mb": max(1, int(value.get("claim_media_max_photo_mb", 5))),
                "claim_media_max_video_mb": max(1, int(value.get("claim_media_max_video_mb", 20))),
                "time_slots": [
                    {
                        "value": (slot.get("value") or "").strip().lower(),
                        "label_fr": (slot.get("label_fr") or "").strip(),
                        "label_en": (slot.get("label_en") or "").strip(),
                    }
                    for slot in (value.get("time_slots") or [])
                    if (slot.get("value") or "").strip()
                ],
            }
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Paramètres de commande invalides")
    if data.key == "payment_methods" and isinstance(value, dict):
        cod = value.get("cod") or {}
        try:
            cod["min_amount_xof"] = max(0, int(cod.get("min_amount_xof", 0)))
            cod["max_amount_xof"] = max(0, int(cod.get("max_amount_xof", 500000)))
            cod["extra_fee_xof"] = max(0, int(cod.get("extra_fee_xof", 0)))
            cod["promo_validity_days"] = max(1, int(cod.get("promo_validity_days", 180)))
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Paramètres COD invalides")
        cod["mode"] = cod.get("mode") if cod.get("mode") in ("all", "selected") else "all"
        cod["refund_methods"] = [
            m for m in (cod.get("refund_methods") or [])
            if m in ("cash", "mobile_money", "promo")
        ] or ["cash"]
        value = {**value, "cod": cod}
    res = await db.execute(select(Setting).where(Setting.key == data.key))
    s = res.scalar_one_or_none()
    if s:
        s.value = value
    else:
        db.add(Setting(key=data.key, value=value))
    await db.commit()
    await bump_cache_version(db)
    return {"ok": True}


# ---------------- CSV exports ----------------
import csv
import io
from fastapi.responses import StreamingResponse


def _csv_response(rows, header, filename):
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(header)
    w.writerows(rows)
    buf.seek(0)
    return StreamingResponse(iter(["\ufeff" + buf.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/export/orders.csv")
async def export_orders(status: Optional[str] = None, payment_status: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    q = select(Order).order_by(Order.created_at.desc())
    if status:
        q = q.where(Order.status == status)
    if payment_status:
        q = q.where(Order.payment_status == payment_status)
    orders = (await db.execute(q)).scalars().all()
    rows = []
    for o in orders:
        a = o.shipping_address or {}
        items = " | ".join(f"{it.get('name_fr')} ({it.get('size')}) x{it.get('quantity')}" for it in (o.items or []))
        rows.append([o.order_number, o.created_at.strftime("%Y-%m-%d %H:%M") if o.created_at else "", o.status, o.payment_status,
                     f"{o.first_name} {o.last_name}", o.email, o.phone, a.get("address_line", ""), a.get("postal_code", ""), a.get("city", ""), a.get("country", ""),
                     o.currency, float(o.subtotal or 0), float(o.discount or 0), o.promo_code, float(o.shipping_cost or 0), float(o.total or 0),
                     o.charge_currency, float(o.charge_total or 0), (o.shipping_method or {}).get("name_fr", ""),
                     o.tracking_carrier, o.tracking_number, o.customer_note or "",
                     o.scheduled_date.isoformat() if o.scheduled_date else "",
                     o.scheduled_time_slot or "",
                     items])
    header = ["Numero", "Date", "Statut", "Paiement", "Client", "Email", "Telephone", "Adresse", "CP", "Ville", "Pays",
              "Devise", "Sous-total", "Remise", "Code promo", "Livraison", "Total", "Devise facturee", "Total facture",
              "Mode livraison", "Transporteur", "N suivi", "Note client",
              "Date prevue", "Creneau",
              "Articles"]
    return _csv_response(rows, header, f"strykos-commandes-{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv")


@router.get("/export/stock.csv")
async def export_stock(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Product).options(selectinload(Product.brand), selectinload(Product.category), selectinload(Product.variants)).order_by(Product.name_fr))
    rows = []
    for p in res.scalars().unique().all():
        for v in p.variants:
            rows.append([p.sku, p.name_fr, p.name_en, p.brand.name if p.brand else "", p.category.name_fr if p.category else "",
                         v.sku, v.size, v.color, v.stock, float(p.price_eur or 0), float(p.sale_price_eur) if p.sale_price_eur is not None else "",
                         float(v.extra_price_eur or 0), "oui" if p.published else "non", p.sales_count or 0, p.slug])
    header = ["SKU produit", "Nom FR", "Nom EN", "Marque", "Categorie", "SKU variante", "Taille", "Couleur", "Stock", "Prix EUR", "Prix promo EUR", "Supplement variante", "Publie", "Ventes", "Slug"]
    return _csv_response(rows, header, f"strykos-stock-{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv")


# ---------------- Reviews moderation ----------------
from models import Review


@router.get("/reviews")
async def admin_reviews(approved: Optional[bool] = None, db: AsyncSession = Depends(get_db)):
    q = select(Review).order_by(Review.created_at.desc()).limit(500)
    if approved is not None:
        q = q.where(Review.approved == approved)
    reviews = (await db.execute(q)).scalars().all()
    pids = {r.product_id for r in reviews}
    names = {}
    if pids:
        pres = await db.execute(select(Product.id, Product.name_fr, Product.slug).where(Product.id.in_(pids)))
        names = {pid: {"name": n, "slug": sl} for pid, n, sl in pres.all()}
    return [{**r.to_dict(admin=True), "product": names.get(r.product_id)} for r in reviews]


@router.put("/reviews/{review_id}/approve")
async def approve_review(review_id: str, data: dict, db: AsyncSession = Depends(get_db)):
    r = (await db.execute(select(Review).where(Review.id == review_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Avis introuvable")
    r.approved = bool(data.get("approved", True))
    await db.commit()
    return {"ok": True, "approved": r.approved}


@router.delete("/reviews/{review_id}")
async def delete_review(review_id: str, db: AsyncSession = Depends(get_db)):
    r = (await db.execute(select(Review).where(Review.id == review_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Avis introuvable")
    await db.delete(r)
    await db.commit()
    return {"ok": True}


class ReplyIn(BaseModel):
    reply: str = ""


@router.put("/reviews/{review_id}/reply")
async def reply_review(review_id: str, data: ReplyIn, db: AsyncSession = Depends(get_db)):
    r = (await db.execute(select(Review).where(Review.id == review_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Avis introuvable")
    r.admin_reply = data.reply.strip()[:2000]
    r.admin_reply_at = datetime.now(timezone.utc) if r.admin_reply else None
    await db.commit()
    return {"ok": True, "review": r.to_dict(admin=True)}


# ================================================================
# ⭐ RÉCLAMATIONS — avec messagerie
# ================================================================

@router.post("/orders/{order_id}/approve-return")
async def approve_return(order_id: str, admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    o = await _get_order(db, order_id)
    if o.status != "return_requested":
        raise HTTPException(status_code=400, detail="Aucune réclamation en cours.")

    o.status = "return_approved"
    o.return_decided_at = datetime.now(timezone.utc)
    push_history(o, "return_approved", by=admin.email, note=f"Réclamation acceptée — {o.return_rma_code}")
    await db.commit()

    try:
        lang = o.lang if o.lang in ("fr", "en") else "fr"
        subject, html = tpl_claim_approved(o.to_dict(), lang, o.return_rma_code or "")
        await send_templated(db, to=o.email, subject=subject, html=html,
                             template="claim_approved", order_id=o.id)
    except Exception:
        pass

    return {"ok": True, "status": o.status}


@router.post("/orders/{order_id}/refuse-return")
async def refuse_return(order_id: str, data: dict, admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    o = await _get_order(db, order_id)
    if o.status not in ("return_requested", "return_approved", "return_received"):
        raise HTTPException(status_code=400, detail="Aucune réclamation active.")

    reason = (data.get("reason") or "").strip()[:500]
    o.status = "delivered"
    o.return_refused_reason = reason
    o.return_decided_at = datetime.now(timezone.utc)
    push_history(o, "delivered", by=admin.email, note=f"Réclamation refusée : {reason[:120]}")
    await db.commit()

    try:
        lang = o.lang if o.lang in ("fr", "en") else "fr"
        subject, html = tpl_claim_refused(o.to_dict(), lang)
        await send_templated(db, to=o.email, subject=subject, html=html,
                             template="claim_refused", order_id=o.id)
    except Exception:
        pass

    return {"ok": True, "status": o.status}


class ClaimRequestInfoIn(BaseModel):
    message: str = ""
    requested_types: list = []


@router.post("/orders/{order_id}/claim/request-info")
async def claim_request_info(order_id: str, data: ClaimRequestInfoIn,
                              admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    o = await _get_order(db, order_id)
    if o.status not in ("return_requested", "return_approved"):
        raise HTTPException(status_code=400, detail="Aucune réclamation active.")

    text = (data.message or "").strip()[:1000]
    if not text:
        raise HTTPException(status_code=400, detail="Écrivez un message au client.")

    requested = [t for t in (data.requested_types or []) if t in ("photo", "video")] or ["photo"]

    o.claim_info_requested_at = datetime.now(timezone.utc)
    o.claim_info_request_message = text
    o.claim_info_request_types = requested

    db.add(ClaimMessage(
        order_id=o.id,
        sender="admin",
        sender_email=admin.email,
        text=text,
        media_urls=[],
        requested_types=requested,
    ))

    push_history(o, o.status, by=admin.email, note=f"Demande d'infos complémentaires : {text[:80]}")
    await db.commit()

    try:
        lang = o.lang if o.lang in ("fr", "en") else "fr"
        subject, html = tpl_claim_info_request(o.to_dict(), lang, text, requested)
        await send_templated(db, to=o.email, subject=subject, html=html,
                             template="claim_info_request", order_id=o.id)
    except Exception as e:
        logger.warning(f"[CLAIM] Email info request échoué: {e}")

    return {"ok": True, "status": o.status}


@router.get("/orders/{order_id}/claim/messages")
async def claim_messages(order_id: str, db: AsyncSession = Depends(get_db)):
    o = await _get_order(db, order_id)
    res = await db.execute(
        select(ClaimMessage)
        .where(ClaimMessage.order_id == o.id)
        .order_by(ClaimMessage.created_at.asc())
    )
    return [m.to_dict() for m in res.scalars().all()]


class RefundReturnIn(BaseModel):
    message: str = ""
    amount: Optional[float] = None


@router.post("/orders/{order_id}/refund-return")
async def refund_return(order_id: str, data: RefundReturnIn = None, admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    o = await _get_order(db, order_id)
    if o.status not in ("return_requested", "return_approved", "return_received"):
        raise HTTPException(status_code=400, detail="Aucune réclamation active pour cette commande.")

    if o.status == "return_requested":
        o.status = "return_approved"
        o.return_decided_at = datetime.now(timezone.utc)
        push_history(o, "return_approved", by=admin.email, note=f"Réclamation acceptée — {o.return_rma_code}")

    if data and data.message:
        o.refund_message = data.message.strip()[:1000]

    o.claim_info_requested_at = None
    o.claim_info_request_message = ""
    o.claim_info_request_types = []

    pres = await db.execute(
        select(Payment).where(
            Payment.order_id == o.id,
            Payment.status.in_(["succeeded", "pending"])
        ).order_by(Payment.created_at.desc())
    )
    pay = pres.scalars().first()

    refund_amount_eur = 0.0
    is_partial = False

    if pay:
        pi = pay.payment_intent
        if not pi and pay.session_id:
            try:
                s = stripe.checkout.Session.retrieve(pay.session_id)
                pi = s.payment_intent
            except stripe.error.StripeError:
                pi = None

        if pi:
            stripe_kwargs = {"payment_intent": pi}
            if data and data.amount is not None and data.amount > 0:
                stripe_kwargs["amount"] = int(round(float(data.amount) * 100))
                original_amount_eur = float(pay.amount or 0)
                if abs(float(data.amount) - original_amount_eur) > 0.01:
                    is_partial = True

            try:
                refund = stripe.Refund.create(**stripe_kwargs)
                refund_amount_eur = (refund.amount or 0) / 100
                pay.status = "refunded" if not is_partial else "partially_refunded"
                pay.payment_intent = pi
                pay.raw_event = {"refund_id": refund.id, "amount": refund.amount, "status": refund.status}
            except stripe.error.StripeError as e:
                raise HTTPException(status_code=502, detail=f"Stripe refund: {e.user_message or str(e)}")

    o.status = "refunded"
    o.payment_status = "partially_refunded" if is_partial else "refunded"
    o.return_decided_at = datetime.now(timezone.utc)

    xof_equivalent = round(refund_amount_eur * 655.957) if o.currency == "XOF" else None
    amount_label = f"{refund_amount_eur:.2f} {o.charge_currency}"
    if xof_equivalent:
        amount_label += f" (≈ {xof_equivalent:,} FCFA)".replace(",", " ")

    if is_partial:
        note = f"Réclamation {o.return_rma_code} · remboursé partiellement {amount_label}"
    else:
        note = f"Réclamation {o.return_rma_code} · remboursé {amount_label}"
    push_history(o, "refunded", by=admin.email, note=note)
    await db.commit()

    try:
        lang = o.lang if o.lang in ("fr", "en") else "fr"
        rates = await get_rates(db)
        display_amount = convert_from_eur(refund_amount_eur, o.currency, rates) or refund_amount_eur
        subject, html = tpl_claim_refunded(o.to_dict(), lang, display_amount)
        await send_templated(db, to=o.email, subject=subject, html=html,
                             template="claim_refunded", order_id=o.id)
    except Exception:
        pass

    return {"ok": True, "status": o.status, "refund_amount": refund_amount_eur, "is_partial": is_partial}


# ---------------- Taxonomies (usage) ----------------
@router.get("/taxonomies/usage")
async def taxonomies_usage(db: AsyncSession = Depends(get_db)):
    from sqlalchemy import func as _f
    g_res = await db.execute(select(Product.gender, _f.count(Product.id)).group_by(Product.gender))
    s_res = await db.execute(select(Product.sport, _f.count(Product.id)).group_by(Product.sport))
    t_res = await db.execute(select(Product.national_team, _f.count(Product.id)).group_by(Product.national_team))
    c_res = await db.execute(select(Product.club, _f.count(Product.id)).group_by(Product.club))
    return {
        "genders": {g or "": c for g, c in g_res.all()},
        "sports": {s or "": c for s, c in s_res.all()},
        "teams": {t or "": c for t, c in t_res.all()},
        "clubs": {c or "": n for c, n in c_res.all()},
    }


# ================================================================
# ⭐ GESTION DES LIVREURS (drivers)
# ================================================================

class DriverInviteIn(BaseModel):
    first_name: str
    last_name: str = ""
    email: str
    phone: str = ""
    notes: str = ""


@router.get("/drivers")
async def list_drivers(db: AsyncSession = Depends(get_db)):
    from models import Profile
    res = await db.execute(
        select(Profile).where(Profile.role == "driver").order_by(Profile.created_at.desc())
    )
    drivers = res.scalars().all()

    stats_res = await db.execute(
        select(Order.delivered_by_driver_id, func.count(Order.id))
        .where(Order.status == "delivered", Order.delivered_via == "otp")
        .group_by(Order.delivered_by_driver_id)
    )
    stats = dict(stats_res.all())

    return [
        {
            **d.to_dict(),
            "deliveries_count": stats.get(d.id, 0),
            "invite_pending": not d.email_verified,
        }
        for d in drivers
    ]


@router.post("/drivers/invite")
async def invite_driver(data: DriverInviteIn, admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    from models import Profile
    email = data.email.lower().strip()

    existing = (await db.execute(select(Profile).where(Profile.email == email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Un compte existe déjà avec cet e-mail")

    from auth import hash_password
    temp_hash = hash_password(secrets.token_urlsafe(32))

    driver = Profile(
        email=email,
        password_hash=temp_hash,
        first_name=data.first_name,
        last_name=data.last_name,
        phone=data.phone,
        role="driver",
        email_verified=False,
    )
    db.add(driver)
    await db.commit()
    await db.refresh(driver)

    token = create_driver_invite_token(driver.id, driver.email)

    try:
        subject, html = tpl_driver_invitation(driver.to_dict(), token, lang="fr")
        await send_templated(db, to=driver.email, subject=subject, html=html,
                             template="driver_invitation")
    except Exception as e:
        import logging
        logging.getLogger("cakes.drivers").warning(f"Email invitation échoué: {e}")

    return {"ok": True, "driver_id": driver.id}


@router.post("/drivers/{driver_id}/resend-invite")
async def resend_driver_invite(driver_id: str, admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    from models import Profile
    driver = (await db.execute(select(Profile).where(Profile.id == driver_id, Profile.role == "driver"))).scalar_one_or_none()
    if not driver:
        raise HTTPException(status_code=404, detail="Livreur introuvable")
    if driver.email_verified:
        raise HTTPException(status_code=400, detail="Ce livreur a déjà activé son compte")

    token = create_driver_invite_token(driver.id, driver.email)

    try:
        subject, html = tpl_driver_invitation(driver.to_dict(), token, lang="fr")
        await send_templated(db, to=driver.email, subject=subject, html=html,
                             template="driver_invitation")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Envoi email échoué: {str(e)[:200]}")

    return {"ok": True}


@router.post("/drivers/{driver_id}/deactivate")
async def deactivate_driver(driver_id: str, admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    from models import Profile
    driver = (await db.execute(select(Profile).where(Profile.id == driver_id, Profile.role == "driver"))).scalar_one_or_none()
    if not driver:
        raise HTTPException(status_code=404, detail="Livreur introuvable")

    from auth import hash_password
    driver.password_hash = hash_password(secrets.token_urlsafe(48))

    await db.commit()
    return {"ok": True}


@router.delete("/drivers/{driver_id}")
async def delete_driver(driver_id: str, admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    from models import Profile
    driver = (await db.execute(select(Profile).where(Profile.id == driver_id, Profile.role == "driver"))).scalar_one_or_none()
    if not driver:
        raise HTTPException(status_code=404, detail="Livreur introuvable")

    await db.delete(driver)
    await db.commit()
    return {"ok": True}


@router.post("/orders/{order_id}/regenerate-otp")
async def regenerate_order_otp(order_id: str, admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    o = await _get_order(db, order_id)

    if o.status not in ("shipped", "in_transit"):
        raise HTTPException(status_code=400, detail="La commande doit être expédiée pour générer un OTP")

    otp = f"{random.randint(0, 999999):06d}"
    o.delivery_otp = otp
    o.delivery_otp_expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    o.delivery_otp_attempts = 0
    o.delivery_otp_locked = False
    push_history(o, o.status, by=admin.email, note=f"Nouveau code OTP généré")
    await db.commit()

    return {"ok": True, "otp": otp}


@router.post("/orders/{order_id}/resend-otp-email")
async def resend_otp_email(order_id: str, admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    from emails import tpl_delivery_otp_client
    o = await _get_order(db, order_id)

    if not o.delivery_otp:
        raise HTTPException(status_code=400, detail="Aucun code OTP actif pour cette commande")

    lang = o.lang if o.lang in ("fr", "en") else "fr"
    try:
        subject, html = tpl_delivery_otp_client(o.to_dict(), o.delivery_otp, lang)
        log = await send_templated(db, to=o.email, subject=subject, html=html,
                                   template="delivery_otp", order_id=o.id)
        if log.status == "failed":
            raise HTTPException(status_code=502, detail=f"Envoi échoué: {log.error[:200]}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur: {str(e)[:200]}")

    return {"ok": True}


# ================================================================
# ⭐ PAIEMENT À LA LIVRAISON : marquer payé manuellement (admin)
# ================================================================

@router.post("/orders/{order_id}/mark-cod-paid")
async def mark_cod_paid(order_id: str, data: dict, admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    o = await _get_order(db, order_id)

    if o.payment_method != "cod":
        raise HTTPException(status_code=400, detail="Cette commande n'est pas en paiement à la livraison")
    if o.payment_status == "paid":
        return {"ok": True, "unchanged": True}

    o.payment_status = "paid"
    o.cod_collected_at = datetime.now(timezone.utc)
    if not o.cod_collected_by_id:
        o.cod_collected_by_id = None

    push_history(o, o.status, by=admin.email, note="Paiement COD reçu (saisie manuelle admin)")
    await db.commit()

    return {"ok": True, "payment_status": o.payment_status}


# ================================================================
# ⭐ REMBOURSEMENT MULTI-MÉTHODES
# ================================================================

class RefundMultiIn(BaseModel):
    method: str
    amount: Optional[float] = None
    reference: str = ""
    note: str = ""
    internal_note: str = ""


@router.post("/orders/{order_id}/refund-multi")
async def refund_multi(order_id: str, data: RefundMultiIn, admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    o = await _get_order(db, order_id)

    if o.payment_status not in ("paid", "partially_refunded"):
        raise HTTPException(status_code=400, detail="Seule une commande payée peut être remboursée")

    method = (data.method or "").strip().lower()
    if method not in ("cash", "mobile_money", "promo", "stripe"):
        raise HTTPException(status_code=400, detail="Méthode de remboursement invalide")

    refund_amount = data.amount if data.amount is not None else float(o.total or 0)
    if refund_amount <= 0:
        raise HTTPException(status_code=400, detail="Montant invalide")

    if method == "mobile_money" and not (data.reference or "").strip():
        raise HTTPException(status_code=400, detail="Numéro ou référence de transaction requis pour Mobile Money")

    promo_code_generated = ""
    stripe_refund_id = ""

    if method == "stripe":
        pres = await db.execute(
            select(Payment).where(
                Payment.order_id == o.id,
                Payment.status.in_(["succeeded", "pending"])
            ).order_by(Payment.created_at.desc())
        )
        pay = pres.scalars().first()
        if not pay:
            raise HTTPException(status_code=400, detail="Aucun paiement Stripe trouvé pour cette commande")

        pi = pay.payment_intent
        if not pi and pay.session_id:
            try:
                s = stripe.checkout.Session.retrieve(pay.session_id)
                pi = s.payment_intent
            except stripe.error.StripeError:
                pi = None

        if not pi:
            raise HTTPException(status_code=400, detail="Impossible de récupérer le paiement Stripe")

        rates = await get_rates(db)
        amount_eur = refund_amount / (rates.get("XOF", 655.957) or 655.957) if o.currency == "XOF" else refund_amount

        try:
            refund = stripe.Refund.create(
                payment_intent=pi,
                amount=int(round(amount_eur * 100)),
            )
            stripe_refund_id = refund.id
            pay.status = "partially_refunded" if refund_amount < float(o.total or 0) else "refunded"
            pay.raw_event = {"refund_id": refund.id, "amount": refund.amount, "status": refund.status}
        except stripe.error.StripeError as e:
            raise HTTPException(status_code=502, detail=f"Stripe: {e.user_message or str(e)}")

    elif method == "promo":
        settings = await get_settings(db)
        validity_days = int((settings.get("payment_methods", {}).get("cod", {}) or {}).get("promo_validity_days", 180))

        base_code = f"REFUND-{o.order_number.replace('STK-', '')[:12]}"
        code = base_code
        i = 1
        while True:
            exists = (await db.execute(select(PromoCode).where(PromoCode.code == code))).scalar_one_or_none()
            if not exists:
                break
            code = f"{base_code}-{i}"
            i += 1

        rates = await get_rates(db)
        amount_eur = refund_amount / (rates.get("XOF", 655.957) or 655.957) if o.currency == "XOF" else refund_amount

        promo = PromoCode(
            code=code,
            description=f"Remboursement commande {o.order_number}",
            discount_type="fixed",
            value=round(amount_eur, 2),
            min_subtotal_eur=0,
            free_shipping=False,
            first_order_only=False,
            usage_limit=1,
            used_count=0,
            active=True,
            expires_at=datetime.now(timezone.utc) + timedelta(days=validity_days),
        )
        db.add(promo)
        promo_code_generated = code

    is_full = abs(refund_amount - float(o.total or 0)) < 1
    o.refund_method = method
    o.refund_reference = (data.reference or "").strip()[:120]
    o.refund_promo_code = promo_code_generated
    o.refund_note = (data.internal_note or "").strip()[:500]
    o.refunded_at = datetime.now(timezone.utc)
    if is_full:
        o.payment_status = "refunded"
        o.status = "refunded"

    method_labels = {"cash": "espèces", "mobile_money": "mobile money", "promo": "code promo", "stripe": "Stripe"}
    note = f"Remboursé {refund_amount:.0f} {o.currency} via {method_labels.get(method, method)}"
    if stripe_refund_id:
        note += f" ({stripe_refund_id})"
    if promo_code_generated:
        note += f" · code: {promo_code_generated}"
    if data.reference:
        note += f" · réf: {data.reference[:40]}"
    push_history(o, o.status, by=admin.email, note=note)

    await db.commit()
    await db.refresh(o)

    try:
        lang = o.lang if o.lang in ("fr", "en") else "fr"
        subject, html = tpl_refund_multi(o.to_dict(), lang, refund_amount, method, promo_code_generated)
        await send_templated(db, to=o.email, subject=subject, html=html,
                             template=f"refund_{method}", order_id=o.id)
    except Exception:
        pass

    return {
        "ok": True,
        "method": method,
        "amount": refund_amount,
        "promo_code": promo_code_generated,
        "stripe_refund_id": stripe_refund_id,
        "is_full": is_full,
    }