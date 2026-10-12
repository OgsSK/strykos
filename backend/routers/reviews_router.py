from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from database import get_db
from models import Review, Product, Order
from auth import get_current_user
from utils import resolve_media
from routers.media_router import _store, ALLOWED_IMAGE
from datetime import datetime, timezone, timedelta

router = APIRouter(tags=["reviews"])

EDIT_WINDOW_DAYS = 14


def _public(r: Review):
    d = r.to_dict()
    d["images"] = [resolve_media(u) for u in d["images"]]
    return d


@router.get("/products/{slug}/reviews")
async def product_reviews(
    slug: str,
    page: int = 1,
    limit: int = 10,
    sort: str = "recent",
    rating: Optional[int] = None,
    verified: Optional[int] = None,
    with_photos: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    """Liste paginee des avis avec filtres et tri.

    - page : numero de page (commence a 1)
    - limit : nombre d'avis par page (max 50)
    - sort : recent | oldest | rating_high | rating_low
    - rating : filtre par note (1-5), None = tous
    - verified : 1 = achat verifie uniquement
    - with_photos : 1 = avec photos uniquement
    """
    p = (await db.execute(select(Product).where(Product.slug == slug))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable")

    # Clamp
    page = max(1, page)
    limit = min(max(1, limit), 50)

    # --- Statistiques globales (toujours sur TOUS les avis, sans filtre) ---
    all_res = await db.execute(
        select(Review).where(Review.product_id == p.id, Review.approved == True)
    )
    all_reviews = all_res.scalars().all()
    total_count = len(all_reviews)
    avg = round(sum(r.rating for r in all_reviews) / total_count, 1) if total_count else 0
    dist = {i: len([r for r in all_reviews if r.rating == i]) for i in range(1, 6)}

    # --- Filtres pour la liste ---
    q = select(Review).where(Review.product_id == p.id, Review.approved == True)
    if rating and 1 <= rating <= 5:
        q = q.where(Review.rating == rating)
    if verified == 1:
        q = q.where(Review.verified_purchase == True)
    if with_photos == 1:
        # Filtre JSON : longueur > 0 (compatible Postgres)
        q = q.where(func.coalesce(func.json_array_length(Review.images), 0) > 0)

    # --- Tri ---
    if sort == "oldest":
        q = q.order_by(Review.created_at.asc())
    elif sort == "rating_high":
        q = q.order_by(Review.rating.desc(), Review.created_at.desc())
    elif sort == "rating_low":
        q = q.order_by(Review.rating.asc(), Review.created_at.desc())
    else:  # recent (default)
        q = q.order_by(Review.created_at.desc())

    # --- Total filtre ---
    count_res = await db.execute(
        select(func.count()).select_from(q.subquery())
    )
    filtered_count = count_res.scalar() or 0

    # --- Pagination ---
    offset = (page - 1) * limit
    q = q.offset(offset).limit(limit)
    res = await db.execute(q)
    reviews = res.scalars().all()

    return {
        "count": total_count,          # total global (pour la moyenne)
        "average": avg,
        "distribution": dist,          # toujours global
        "filtered_count": filtered_count,   # combien apres filtres
        "page": page,
        "limit": limit,
        "pages": (filtered_count + limit - 1) // limit if filtered_count else 1,
        "reviews": [_public(r) for r in reviews],
    }


@router.get("/products/{slug}/my-review")
async def my_review(slug: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Retourne l'avis de l'utilisateur + son éligibilité à en laisser un."""
    p = (await db.execute(select(Product).where(Product.slug == slug))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable")

    # Avis existant ?
    r = (await db.execute(select(Review).where(Review.product_id == p.id, Review.user_id == user.id))).scalar_one_or_none()

    # A une commande livrée avec ce produit ?
    delivered_orders = await db.execute(
        select(Order.items).where(
            Order.user_id == user.id,
            Order.status == "delivered",
            Order.items.isnot(None),
        )
    )
    has_delivered = any(
        it.get("product_id") == p.id
        for items in delivered_orders.scalars().all()
        for it in (items or [])
    )

    # A une commande en cours (payée mais pas encore livrée) ?
    pending_orders = await db.execute(
        select(Order.items).where(
            Order.user_id == user.id,
            Order.status.in_(["paid", "preparing", "shipped", "in_transit"]),
            Order.items.isnot(None),
        )
    )
    has_pending = any(
        it.get("product_id") == p.id
        for items in pending_orders.scalars().all()
        for it in (items or [])
    )

    can_review = has_delivered
    reason = None
    if not can_review:
        if has_pending:
            reason = "pending_delivery"  # a commandé, pas encore livré
        else:
            reason = "never_ordered"  # jamais commandé

    return {
        "review": _public(r) if r else None,
        "can_review": can_review,
        "has_review": bool(r),
        "reason": reason,  # null si can_review=true
    }


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    title: str = ""
    body: str = Field(min_length=3, max_length=2000)
    images: list[str] = []
    lang: str = "fr"


@router.post("/products/{slug}/reviews")
async def create_review(slug: str, data: ReviewIn, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = (await db.execute(select(Product).where(Product.slug == slug))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable")

    existing = (await db.execute(select(Review).where(Review.product_id == p.id, Review.user_id == user.id))).scalar_one_or_none()

    # Règle : on ne peut donner un avis QUE si le produit a été livré
    delivered_orders = await db.execute(
        select(Order.items).where(
            Order.user_id == user.id,
            Order.status == "delivered",
            Order.items.isnot(None),
        )
    )
    has_delivered = any(
        it.get("product_id") == p.id
        for items in delivered_orders.scalars().all()
        for it in (items or [])
    )
    if not has_delivered:
        msg = (
            "Vous devez avoir recu ce produit pour laisser un avis (commande livree)."
            if data.lang == "fr"
            else "You must have received this product to leave a review (delivered order)."
        )
        raise HTTPException(status_code=403, detail=msg)
    verified = True

    images = [u for u in data.images if u.startswith("http") or u.startswith("/api/media/")][:4]
    from utils import normalize_media
    images = [normalize_media(u) for u in images]
    author = f"{user.first_name} {user.last_name[:1]}.".strip() if user.first_name else user.email.split("@")[0]

    if existing:
        age = datetime.now(timezone.utc) - existing.created_at
        if age > timedelta(days=EDIT_WINDOW_DAYS):
            msg = (
                f"Delai de modification depasse ({EDIT_WINDOW_DAYS} jours)"
                if data.lang == "fr"
                else f"Edit window has passed ({EDIT_WINDOW_DAYS} days)"
            )
            raise HTTPException(status_code=403, detail=msg)
        existing.rating = data.rating
        existing.title = data.title.strip()[:160]
        existing.body = data.body.strip()
        existing.images = images
        existing.verified_purchase = verified
        existing.approved = True
        existing.edited_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(existing)
        return {"ok": True, "review": _public(existing), "updated": True}

    r = Review(
        product_id=p.id, user_id=user.id, author_name=author,
        rating=data.rating, title=data.title.strip()[:160],
        body=data.body.strip(), images=images,
        verified_purchase=verified, approved=True,
    )
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return {"ok": True, "review": _public(r)}


@router.delete("/reviews/{review_id}")
async def delete_my_review(review_id: str, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    r = (await db.execute(select(Review).where(Review.id == review_id, Review.user_id == user.id))).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Avis introuvable")
    await db.delete(r)
    await db.commit()
    return {"ok": True}


@router.post("/reviews/upload")
async def upload_review_image(file: UploadFile = File(...), user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if file.content_type not in ALLOWED_IMAGE:
        raise HTTPException(status_code=400, detail="Image uniquement (jpg/png/webp)")
    data = await file.read()
    if len(data) > 6 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image trop volumineuse (6 Mo max)")
    m = await _store(db, data, file.filename or "review.jpg", file.content_type)
    return {"url": resolve_media(m.to_dict()["url"])}


async def attach_ratings(db, items: list[dict]):
    """Mutates serialized product dicts: adds rating_avg / review_count (one grouped query)."""
    ids = [p["id"] for p in items]
    if not ids:
        return items
    res = await db.execute(select(Review.product_id, func.avg(Review.rating), func.count(Review.id))
                           .where(Review.product_id.in_(ids), Review.approved == True).group_by(Review.product_id))
    stats = {pid: (round(float(avg), 1), cnt) for pid, avg, cnt in res.all()}
    for p in items:
        p["rating_avg"], p["review_count"] = stats.get(p["id"], (0, 0))
    return items