import os
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
                    Profile, PromoCode, EmailLog)
from auth import get_current_admin
from utils import get_rates, serialize_product, get_settings, normalize_media
from emails import send_order_email, emails_enabled, EMAIL_FROM_NAME, EMAIL_REPLY_TO, ADMIN_NOTIFY_EMAIL
from routers.commerce_router import push_history

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

    # 14-day series (paid orders count + EUR-equivalent charge totals)
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

    return {
        "total_orders": len(orders),
        "paid_orders": len(paid),
        "revenue_by_currency": {k: round(v, 2) for k, v in revenue_by_currency.items()},
        "revenue_30d": {k: round(v, 2) for k, v in revenue_30d.items()},
        "pending_payments": len([o for o in orders if o.payment_status == "pending"]),
        "orders_to_process": len([o for o in orders if o.status in ("paid", "preparing")]),
        "orders_shipped": len([o for o in orders if o.status in ("shipped", "in_transit")]),
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
    club: str = ""
    national_team: str = ""
    surface: str = ""
    product_type: str = ""
    colors: list = []
    customizable: bool = False
    customization_price_eur: float = 0
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


def _product_fields(data: ProductIn):
    d = {k: v for k, v in data.model_dump().items() if k not in ("images", "variants")}
    d["video_url"] = normalize_media(d.get("video_url", ""))
    d["slug"] = d["slug"].strip().lower()
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
    return {"ok": True}


@router.put("/products/{product_id}/publish")
async def toggle_publish(product_id: str, data: dict, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Product).where(Product.id == product_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    p.published = bool(data.get("published", True))
    await db.commit()
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
    return {"ok": True}


@router.delete("/brands/{brand_id}")
async def delete_brand(brand_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Brand).where(Brand.id == brand_id))
    b = res.scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="Marque introuvable")
    await db.delete(b)
    await db.commit()
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


@router.get("/categories")
async def admin_categories(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Category).order_by(Category.position))
    cats = res.scalars().all()
    counts = dict((await db.execute(select(Product.category_id, func.count(Product.id)).group_by(Product.category_id))).all())
    return [{**c.to_dict(), "product_count": counts.get(c.id, 0)} for c in cats]


@router.post("/categories")
async def create_category(data: CategoryIn, db: AsyncSession = Depends(get_db)):
    if (await db.execute(select(Category).where(Category.slug == data.slug))).scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Slug deja utilise")
    c = Category(**data.model_dump())
    db.add(c)
    await db.commit()
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
    return {"ok": True}


@router.delete("/categories/{category_id}")
async def delete_category(category_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Category).where(Category.id == category_id))
    c = res.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Categorie introuvable")
    await db.delete(c)
    await db.commit()
    return {"ok": True}


# ---------------- Orders ----------------
VALID_STATUSES = ["pending_payment", "paid", "preparing", "shipped", "in_transit",
                  "delivered", "cancelled", "return_requested", "returned", "refunded"]


@router.get("/orders")
async def admin_orders(status: Optional[str] = None, payment_status: Optional[str] = None,
                       q: Optional[str] = None, limit: int = 200, db: AsyncSession = Depends(get_db)):
    query = select(Order).order_by(Order.created_at.desc()).limit(min(limit, 500))
    if status:
        query = query.where(Order.status == status)
    if payment_status:
        query = query.where(Order.payment_status == payment_status)
    if q:
        term = f"%{q.strip()}%"
        query = query.where(or_(Order.order_number.ilike(term), Order.email.ilike(term),
                                Order.first_name.ilike(term), Order.last_name.ilike(term),
                                Order.tracking_number.ilike(term)))
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
    return {"ok": True, "email": email_log.to_dict() if email_log else None}


class TrackingIn(BaseModel):
    tracking_carrier: str = ""
    tracking_number: str = ""
    tracking_url: str = ""
    mark_shipped: bool = True
    notify: bool = True


@router.put("/orders/{order_id}/tracking")
async def update_tracking(order_id: str, data: TrackingIn, admin=Depends(get_current_admin),
                          db: AsyncSession = Depends(get_db)):
    o = await _get_order(db, order_id)
    url = data.tracking_url.strip()
    if url and not url.lower().startswith("https://"):
        raise HTTPException(status_code=400, detail="Le lien de suivi doit commencer par https://")
    o.tracking_carrier, o.tracking_number, o.tracking_url = data.tracking_carrier.strip(), data.tracking_number.strip(), url
    sent = None
    if data.mark_shipped and o.status in ("paid", "preparing"):
        o.status = "shipped"
        o.shipped_at = datetime.now(timezone.utc)
        push_history(o, "shipped", by=admin.email, note=f"{o.tracking_carrier} {o.tracking_number}".strip())
        await db.commit()
        if data.notify and o.email:
            sent = await send_order_email(db, o, "order_shipped")
    else:
        push_history(o, o.status, by=admin.email, note=f"Suivi mis a jour: {o.tracking_carrier} {o.tracking_number}".strip())
        await db.commit()
        if data.notify and o.email and o.status in ("shipped", "in_transit"):
            sent = await send_order_email(db, o, "order_shipped")
    return {"ok": True, "order": o.to_dict(), "email": sent.to_dict() if sent else None}


class NotesIn(BaseModel):
    admin_notes: str = ""


@router.put("/orders/{order_id}/notes")
async def update_notes(order_id: str, data: NotesIn, db: AsyncSession = Depends(get_db)):
    o = await _get_order(db, order_id)
    o.admin_notes = data.admin_notes
    await db.commit()
    return {"ok": True}


class ResendIn(BaseModel):
    template: str  # order_confirmed | order_shipped | order_delivered


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
    amount: Optional[float] = None  # in charge currency; None = full
    restock: bool = True
    notify: bool = True


@router.post("/orders/{order_id}/refund")
async def refund_order(order_id: str, data: RefundIn, admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    o = await _get_order(db, order_id)
    if o.payment_status != "paid":
        raise HTTPException(status_code=400, detail="Seule une commande payee peut etre remboursee")
    pres = await db.execute(select(Payment).where(Payment.order_id == o.id, Payment.status == "succeeded"))
    pay = pres.scalar_one_or_none()
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
        if data.restock:
            for item in (o.items or []):
                vr = await db.execute(select(ProductVariant).where(ProductVariant.id == item["variant_id"]))
                v = vr.scalar_one_or_none()
                if v:
                    v.stock += item["quantity"]
    push_history(o, o.status, by=admin.email, note=f"Remboursement Stripe {refund.id} ({refund.amount / 100:.2f} {o.charge_currency})")
    await db.commit()
    if data.notify and full and o.email:
        await send_order_email(db, o, "order_cancelled", refunded=True)
    return {"ok": True, "refund_id": refund.id, "full": full, "order": o.to_dict()}


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
    return {"ok": True}


@router.delete("/promos/{promo_id}")
async def delete_promo(promo_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(PromoCode).where(PromoCode.id == promo_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Code introuvable")
    await db.delete(p)
    await db.commit()
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


# ---------------- Settings ----------------
@router.get("/settings")
async def admin_get_settings(db: AsyncSession = Depends(get_db)):
    return await get_settings(db)


class SettingIn(BaseModel):
    key: str
    value: Any


ALLOWED_SETTING_KEYS = {"currency", "info_bar", "hero", "sections", "icons", "shipping", "site", "payment_providers"}


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
    res = await db.execute(select(Setting).where(Setting.key == data.key))
    s = res.scalar_one_or_none()
    if s:
        s.value = value
    else:
        db.add(Setting(key=data.key, value=value))
    await db.commit()
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
                     o.tracking_carrier, o.tracking_number, items])
    header = ["Numero", "Date", "Statut", "Paiement", "Client", "Email", "Telephone", "Adresse", "CP", "Ville", "Pays",
              "Devise", "Sous-total", "Remise", "Code promo", "Livraison", "Total", "Devise facturee", "Total facture",
              "Mode livraison", "Transporteur", "N suivi", "Articles"]
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
