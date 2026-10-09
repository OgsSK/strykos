from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import Review, Product, Order
from auth import get_current_user
from utils import resolve_media
from routers.media_router import _store, ALLOWED_IMAGE

router = APIRouter(tags=["reviews"])


def _public(r: Review):
    d = r.to_dict()
    d["images"] = [resolve_media(u) for u in d["images"]]
    return d


@router.get("/products/{slug}/reviews")
async def product_reviews(slug: str, db: AsyncSession = Depends(get_db)):
    p = (await db.execute(select(Product).where(Product.slug == slug))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    res = await db.execute(select(Review).where(Review.product_id == p.id, Review.approved == True).order_by(Review.created_at.desc()))
    reviews = res.scalars().all()
    count = len(reviews)
    avg = round(sum(r.rating for r in reviews) / count, 1) if count else 0
    dist = {i: len([r for r in reviews if r.rating == i]) for i in range(1, 6)}
    return {"count": count, "average": avg, "distribution": dist, "reviews": [_public(r) for r in reviews]}


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    title: str = ""
    body: str = Field(min_length=3, max_length=2000)
    images: list[str] = []


@router.post("/products/{slug}/reviews")
async def create_review(slug: str, data: ReviewIn, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    p = (await db.execute(select(Product).where(Product.slug == slug))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    existing = (await db.execute(select(Review).where(Review.product_id == p.id, Review.user_id == user.id))).scalar_one_or_none()
    paid = await db.execute(select(func.count(Order.id)).where(Order.user_id == user.id, Order.payment_status == "paid"))
    verified = False
    if (paid.scalar() or 0) > 0:
        ores = await db.execute(select(Order.items).where(Order.user_id == user.id, Order.payment_status == "paid"))
        verified = any(it.get("product_id") == p.id for items in ores.scalars().all() for it in (items or []))
    images = [u for u in data.images if u.startswith("http") or u.startswith("/api/media/")][:4]
    from utils import normalize_media
    images = [normalize_media(u) for u in images]
    author = f"{user.first_name} {user.last_name[:1]}.".strip() if user.first_name else user.email.split("@")[0]
    if existing:
        existing.rating, existing.title, existing.body, existing.images = data.rating, data.title.strip()[:160], data.body.strip(), images
        existing.verified_purchase, existing.approved = verified, True
        await db.commit()
        return {"ok": True, "review": _public(existing), "updated": True}
    r = Review(product_id=p.id, user_id=user.id, author_name=author, rating=data.rating, title=data.title.strip()[:160],
               body=data.body.strip(), images=images, verified_purchase=verified, approved=True)
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
