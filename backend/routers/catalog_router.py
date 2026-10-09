from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, or_, and_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import Product, Brand, Category, ProductVariant
from utils import get_rates, serialize_product, SUPPORTED_CURRENCIES

router = APIRouter(tags=["catalog"])


@router.get("/brands")
async def list_brands(local: bool | None = None, db: AsyncSession = Depends(get_db)):
    q = select(Brand).where(Brand.published == True)
    if local is not None:
        q = q.where(Brand.is_local == local)
    q = q.order_by(Brand.name)
    result = await db.execute(q)
    return [b.to_dict() for b in result.scalars().all()]


@router.get("/categories")
async def list_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Category).where(Category.published == True).order_by(Category.position))
    return [c.to_dict() for c in result.scalars().all()]


async def _base_product_query():
    return (
        select(Product)
        .where(Product.published == True)
        .options(selectinload(Product.brand), selectinload(Product.category),
                 selectinload(Product.images), selectinload(Product.variants))
    )


@router.get("/products")
async def list_products(
    db: AsyncSession = Depends(get_db),
    category: str | None = None,
    brand: str | None = None,
    club: str | None = None,
    national_team: str | None = None,
    surface: str | None = None,
    product_type: str | None = None,
    color: str | None = None,
    size: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    in_stock: bool | None = None,
    on_sale: bool | None = None,
    is_new: bool | None = None,
    is_featured: bool | None = None,
    is_best_seller: bool | None = None,
    search: str | None = None,
    sort: str = "relevance",
    page: int = 1,
    limit: int = Query(24, le=100),
):
    rates = await get_rates(db)
    q = await _base_product_query()
    conds = []
    if category:
        q = q.join(Category, Product.category_id == Category.id)
        conds.append(or_(Category.slug == category, Category.type == category))
    if brand:
        q = q.join(Brand, Product.brand_id == Brand.id)
        conds.append(Brand.slug == brand)
    if club:
        conds.append(Product.club.ilike(f"%{club}%"))
    if national_team:
        conds.append(Product.national_team.ilike(f"%{national_team}%"))
    if surface:
        conds.append(Product.surface == surface)
    if product_type:
        conds.append(Product.product_type == product_type)
    if on_sale:
        conds.append(Product.sale_price_eur.isnot(None))
    if is_new:
        conds.append(Product.is_new == True)
    if is_featured:
        conds.append(Product.is_featured == True)
    if is_best_seller:
        conds.append(Product.is_best_seller == True)
    if min_price is not None:
        conds.append(Product.price_eur >= min_price)
    if max_price is not None:
        conds.append(Product.price_eur <= max_price)
    if search:
        term = f"%{search.strip()}%"
        conds.append(or_(
            Product.name_fr.ilike(term), Product.name_en.ilike(term),
            Product.club.ilike(term), Product.national_team.ilike(term), Product.sku.ilike(term),
        ))
    if conds:
        q = q.where(and_(*conds))

    if sort == "price_asc":
        q = q.order_by(Product.price_eur.asc())
    elif sort == "price_desc":
        q = q.order_by(Product.price_eur.desc())
    elif sort == "new":
        q = q.order_by(Product.created_at.desc())
    elif sort == "best_sellers":
        q = q.order_by(Product.sales_count.desc())
    else:
        q = q.order_by(Product.is_featured.desc(), Product.sales_count.desc(), Product.created_at.desc())

    result = await db.execute(q)
    products = result.scalars().unique().all()

    # variant-level filters (color/size/stock) applied in python
    def matches(p):
        if color and color.lower() not in [c.lower() for c in (p.colors or [])] \
                and not any(v.color.lower() == color.lower() for v in p.variants):
            return False
        if size and not any(v.size.lower() == size.lower() for v in p.variants):
            return False
        if in_stock and sum(v.stock for v in p.variants) <= 0:
            return False
        return True

    products = [p for p in products if matches(p)]
    total = len(products)
    start = (page - 1) * limit
    page_items = products[start:start + limit]
    return {
        "total": total, "page": page, "limit": limit,
        "products": [serialize_product(p, rates) for p in page_items],
    }


@router.get("/products/search-suggest")
async def search_suggest(q: str = Query(..., min_length=1), db: AsyncSession = Depends(get_db)):
    rates = await get_rates(db)
    term = f"%{q.strip()}%"
    query = (await _base_product_query()).where(or_(
        Product.name_fr.ilike(term), Product.name_en.ilike(term),
        Product.club.ilike(term), Product.national_team.ilike(term),
    )).limit(6)
    result = await db.execute(query)
    products = result.scalars().unique().all()
    return {"products": [serialize_product(p, rates) for p in products]}


@router.get("/products/{slug}")
async def product_detail(slug: str, db: AsyncSession = Depends(get_db)):
    rates = await get_rates(db)
    q = (await _base_product_query()).where(Product.slug == slug)
    result = await db.execute(q)
    product = result.scalars().unique().one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    data = serialize_product(product, rates, full=True)
    # related: same category, different product
    rel_q = (await _base_product_query()).where(
        Product.category_id == product.category_id, Product.id != product.id
    ).limit(4)
    rel = await db.execute(rel_q)
    data["related"] = [serialize_product(p, rates) for p in rel.scalars().unique().all()]
    return data


@router.get("/home")
async def homepage(db: AsyncSession = Depends(get_db)):
    rates = await get_rates(db)

    async def section(**filters):
        q = await _base_product_query()
        for attr, val in filters.items():
            q = q.where(getattr(Product, attr) == val)
        q = q.order_by(Product.created_at.desc()).limit(8)
        res = await db.execute(q)
        return [serialize_product(p, rates) for p in res.scalars().unique().all()]

    async def sale_section():
        q = (await _base_product_query()).where(Product.sale_price_eur.isnot(None)).limit(8)
        res = await db.execute(q)
        return [serialize_product(p, rates) for p in res.scalars().unique().all()]

    return {
        "new_arrivals": await section(is_new=True),
        "best_sellers": await section(is_best_seller=True),
        "featured": await section(is_featured=True),
        "promotions": await sale_section(),
    }
