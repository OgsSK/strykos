from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, or_, and_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import Product, Brand, Category
from utils import get_rates, get_settings, serialize_product
from routers.reviews_router import attach_ratings

router = APIRouter(tags=["catalog"])


@router.get("/brands")
async def list_brands(local: bool | None = None, db: AsyncSession = Depends(get_db)):
    q = select(Brand).where(Brand.published == True)
    if local is not None:
        q = q.where(Brand.is_local == local)
    q = q.order_by(Brand.name)
    result = await db.execute(q)
    return [b.to_dict() for b in result.scalars().all()]


@router.get("/taxonomies")
async def list_taxonomies(db: AsyncSession = Depends(get_db)):
    """Retourne les genres, sports et sélections configurés (public)."""
    s = await get_settings(db)
    tx = s.get("taxonomies", {}) if s else {}
    return {
        "genders": tx.get("genders", []),
        "sports": tx.get("sports", []),
        "teams": tx.get("teams", []),
        "clubs": tx.get("clubs", []),
    }


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
    team: str | None = None,
    gender: str | None = None,
    sport: str | None = None,
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

    # ⭐ Filtre catégorie : parent + sous-catégories
    if category:
        cat_res = await db.execute(
            select(Category).where(or_(Category.slug == category, Category.type == category))
        )
        matched_cats = cat_res.scalars().all()

        if matched_cats:
            parent_ids = [c.id for c in matched_cats]

            child_res = await db.execute(
                select(Category.id).where(Category.parent_id.in_(parent_ids))
            )
            child_ids = [row[0] for row in child_res.all()]

            all_valid_ids = parent_ids + child_ids
            conds.append(Product.category_id.in_(all_valid_ids))
        else:
            # Slug/type inconnu → aucun résultat (évite de renvoyer tout le catalogue)
            conds.append(Product.category_id == -1)

    if brand:
        q = q.join(Brand, Product.brand_id == Brand.id)
        conds.append(Brand.slug == brand)
    if club:
        conds.append(Product.club == club)
    if national_team:
        conds.append(Product.national_team.ilike(f"%{national_team}%"))
    if team:
        conds.append(Product.national_team == team)
    if gender:
        conds.append(Product.gender == gender)
    if sport:
        conds.append(Product.sport == sport)
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
        "products": await attach_ratings(db, [serialize_product(p, rates) for p in page_items]),
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
    data = (await attach_ratings(db, [serialize_product(product, rates, full=True)]))[0]
    # related: same category, different product
    rel_q = (await _base_product_query()).where(
        Product.category_id == product.category_id, Product.id != product.id
    ).limit(4)
    rel = await db.execute(rel_q)
    data["related"] = [serialize_product(p, rates) for p in rel.scalars().unique().all()]
    return data


@router.get("/nav")
async def nav_menu(db: AsyncSession = Depends(get_db)):
    """Retourne la navigation DYNAMIQUE : 4 catégories mères + leurs sous-catégories.
    Seules celles avec ≥1 produit sont affichées."""
    from sqlalchemy import func as _f
    from collections import Counter

    # Tous les produits publiés
    prod_res = await db.execute(
        select(Product.category_id, Product.brand_id, Product.is_new, Product.sale_price_eur, Product.customizable, Product.gender, Product.sport)
        .where(Product.published == True)
    )
    rows = prod_res.all()

    cat_counts = Counter()
    brand_counts = Counter()
    gender_counts = Counter()
    sport_counts = Counter()
    is_new_count = 0
    on_sale_count = 0
    customizable_count = 0
    for cat_id, brand_id, is_new, sale, custom, gender, sport in rows:
        if cat_id: cat_counts[cat_id] += 1
        if brand_id: brand_counts[brand_id] += 1
        if gender: gender_counts[gender] += 1
        if sport: sport_counts[sport] += 1
        if is_new: is_new_count += 1
        if sale is not None: on_sale_count += 1
        if custom: customizable_count += 1

    # Récupère TOUTES les catégories publiées (mères ET enfants)
    all_cats_res = await db.execute(
        select(Category).where(Category.published == True).order_by(Category.position)
    )
    all_cats = all_cats_res.scalars().all()

    # Sépare mères et enfants
    parents = [c for c in all_cats if not c.parent_id]
    children_by_parent = {}
    for c in all_cats:
        if c.parent_id:
            children_by_parent.setdefault(c.parent_id, []).append(c)

    # Construit la hiérarchie
    categories_tree = []
    for parent in parents:
        children = children_by_parent.get(parent.id, [])
        # Enfants qui ont des produits
        visible_children = [
            {
                "id": child.id,
                "slug": child.slug,
                "name_fr": child.name_fr,
                "name_en": child.name_en,
                "count": cat_counts[child.id],
            }
            for child in children
            if cat_counts[child.id] > 0
        ]
        # Le parent s'affiche s'il a des produits OU des enfants avec produits
        parent_count = cat_counts[parent.id] + sum(ch["count"] for ch in visible_children)
        if parent_count > 0:
            categories_tree.append({
                "id": parent.id,
                "slug": parent.slug,
                "name_fr": parent.name_fr,
                "name_en": parent.name_en,
                "count": parent_count,
                "children": visible_children,
            })

    # Marques
    brand_ids = [k for k in brand_counts.keys() if k]
    brands = []
    if brand_ids:
        b_res = await db.execute(
            select(Brand).where(Brand.id.in_(brand_ids), Brand.published == True).order_by(Brand.name)
        )
        brands = [
            {"slug": b.slug, "name": b.name, "count": brand_counts[b.id]}
            for b in b_res.scalars().all()
        ]

    # Taxonomies
    s = await get_settings(db)
    tx = s.get("taxonomies", {}) if s else {}
    genders = [{"value": g["value"], "name_fr": g["name_fr"], "name_en": g["name_en"], "count": gender_counts[g["value"]]}
               for g in tx.get("genders", []) if gender_counts[g["value"]] > 0]
    sports = [{"value": sp["value"], "name_fr": sp["name_fr"], "name_en": sp["name_en"], "count": sport_counts[sp["value"]]}
              for sp in tx.get("sports", []) if sport_counts[sp["value"]] > 0]

    return {
        "categories": categories_tree,   # ← hiérarchie parent + enfants
        "brands": brands,
        "genders": genders,
        "sports": sports,
        "teams": [],
        "clubs": [],
        "filters": {
            "is_new": is_new_count,
            "on_sale": on_sale_count,
            "customizable": customizable_count,
        },
    }


@router.get("/home")
async def homepage(db: AsyncSession = Depends(get_db)):
    rates = await get_rates(db)

    async def section(**filters):
        q = await _base_product_query()
        for attr, val in filters.items():
            q = q.where(getattr(Product, attr) == val)
        q = q.order_by(Product.created_at.desc()).limit(8)
        res = await db.execute(q)
        return await attach_ratings(db, [serialize_product(p, rates) for p in res.scalars().unique().all()])

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