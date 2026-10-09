from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime, timezone
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import (Product, ProductImage, ProductVariant, Brand, Category, Order, Payment, Setting)
from auth import get_current_admin
from utils import get_rates, serialize_product, get_settings, DEFAULT_SETTINGS

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_current_admin)])


# ---------------- Dashboard ----------------
@router.get("/dashboard")
async def dashboard(db: AsyncSession = Depends(get_db)):
    orders_res = await db.execute(select(Order))
    orders = orders_res.scalars().all()
    paid = [o for o in orders if o.payment_status == "paid"]
    revenue_by_currency = {}
    for o in paid:
        revenue_by_currency[o.currency] = revenue_by_currency.get(o.currency, 0) + float(o.total or 0)
    pending_payments = len([o for o in orders if o.payment_status == "pending"])
    to_process = len([o for o in orders if o.status == "paid"])

    prod_res = await db.execute(select(Product).options(selectinload(Product.variants)))
    products = prod_res.scalars().unique().all()
    out_of_stock = len([p for p in products if sum(v.stock for v in p.variants) == 0])
    low_stock = [{"id": p.id, "name": p.name_fr, "stock": sum(v.stock for v in p.variants)}
                 for p in products if 0 < sum(v.stock for v in p.variants) <= 5]
    best_sellers = sorted(products, key=lambda p: p.sales_count or 0, reverse=True)[:5]

    return {
        "total_orders": len(orders),
        "paid_orders": len(paid),
        "revenue_by_currency": {k: round(v, 2) for k, v in revenue_by_currency.items()},
        "pending_payments": pending_payments,
        "orders_to_process": to_process,
        "total_products": len(products),
        "out_of_stock": out_of_stock,
        "low_stock": low_stock,
        "best_sellers": [{"id": p.id, "name": p.name_fr, "sales": p.sales_count or 0} for p in best_sellers],
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


@router.post("/products")
async def create_product(data: ProductIn, db: AsyncSession = Depends(get_db)):
    exists = await db.execute(select(Product).where(Product.slug == data.slug))
    if exists.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Un produit avec ce slug existe deja")
    p = Product(**{k: v for k, v in data.model_dump().items() if k not in ("images", "variants")})
    db.add(p)
    await db.flush()
    for i, url in enumerate(data.images):
        db.add(ProductImage(product_id=p.id, url=url, position=i))
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
    for k, v in data.model_dump().items():
        if k not in ("images", "variants"):
            setattr(p, k, v)
    for img in list(p.images):
        await db.delete(img)
    for i, url in enumerate(data.images):
        db.add(ProductImage(product_id=p.id, url=url, position=i))
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


@router.delete("/products/{product_id}")
async def delete_product(product_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Product).where(Product.id == product_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    p.published = False
    await db.commit()
    return {"ok": True}


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


@router.post("/brands")
async def create_brand(data: BrandIn, db: AsyncSession = Depends(get_db)):
    db.add(Brand(**data.model_dump()))
    await db.commit()
    return {"ok": True}


@router.put("/brands/{brand_id}")
async def update_brand(brand_id: str, data: BrandIn, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Brand).where(Brand.id == brand_id))
    b = res.scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="Marque introuvable")
    for k, v in data.model_dump().items():
        setattr(b, k, v)
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


@router.post("/categories")
async def create_category(data: CategoryIn, db: AsyncSession = Depends(get_db)):
    db.add(Category(**data.model_dump()))
    await db.commit()
    return {"ok": True}


# ---------------- Orders ----------------
@router.get("/orders")
async def admin_orders(status: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    q = select(Order).order_by(Order.created_at.desc())
    if status:
        q = q.where(Order.status == status)
    res = await db.execute(q)
    return [o.to_dict() for o in res.scalars().all()]


class OrderStatusIn(BaseModel):
    status: str


VALID_STATUSES = ["pending_payment", "paid", "preparing", "shipped", "in_transit",
                  "delivered", "cancelled", "return_requested", "returned", "refunded"]


@router.put("/orders/{order_id}/status")
async def update_order_status(order_id: str, data: OrderStatusIn, db: AsyncSession = Depends(get_db)):
    if data.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Statut invalide")
    res = await db.execute(select(Order).where(Order.id == order_id))
    o = res.scalar_one_or_none()
    if not o:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    o.status = data.status
    await db.commit()
    return {"ok": True}


@router.get("/payments")
async def admin_payments(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Payment).order_by(Payment.created_at.desc()))
    return [p.to_dict() for p in res.scalars().all()]


# ---------------- Settings ----------------
@router.get("/settings")
async def admin_get_settings(db: AsyncSession = Depends(get_db)):
    return await get_settings(db)


class SettingIn(BaseModel):
    key: str
    value: Any


@router.put("/settings")
async def admin_update_setting(data: SettingIn, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Setting).where(Setting.key == data.key))
    s = res.scalar_one_or_none()
    if s:
        s.value = data.value
    else:
        db.add(Setting(key=data.key, value=data.value))
    await db.commit()
    return {"ok": True}
