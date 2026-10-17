from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import Product, Brand, Category

router = APIRouter(tags=["seo"])

BASE_URL = "https://cakes.actoos.com"


def _url(loc: str, changefreq: str = "weekly", priority: str = "0.5", lastmod: str | None = None) -> str:
    xml = f"<url><loc>{loc}</loc>"
    if lastmod:
        xml += f"<lastmod>{lastmod}</lastmod>"
    xml += f"<changefreq>{changefreq}</changefreq><priority>{priority}</priority></url>"
    return xml


@router.get("/sitemap.xml", response_class=Response)
async def sitemap(db: AsyncSession = Depends(get_db)):
    urls = []

    # Pages statiques
    urls.append(_url(f"{BASE_URL}/", "daily", "1.0"))
    urls.append(_url(f"{BASE_URL}/catalog", "daily", "0.9"))
    urls.append(_url(f"{BASE_URL}/brands", "weekly", "0.7"))
    urls.append(_url(f"{BASE_URL}/page/about", "monthly", "0.4"))
    urls.append(_url(f"{BASE_URL}/page/contact", "monthly", "0.5"))
    urls.append(_url(f"{BASE_URL}/page/shipping", "monthly", "0.3"))
    urls.append(_url(f"{BASE_URL}/page/returns", "monthly", "0.3"))
    urls.append(_url(f"{BASE_URL}/page/faq", "monthly", "0.4"))
    urls.append(_url(f"{BASE_URL}/page/terms", "yearly", "0.2"))
    urls.append(_url(f"{BASE_URL}/page/privacy", "yearly", "0.2"))
    urls.append(_url(f"{BASE_URL}/page/cookies", "yearly", "0.2"))
    urls.append(_url(f"{BASE_URL}/page/legal", "yearly", "0.2"))

    # Produits (gâteaux)
    res = await db.execute(
        select(Product).where(Product.published == True).order_by(Product.created_at.desc())
    )
    for p in res.scalars().all():
        lm = p.created_at.strftime("%Y-%m-%d") if p.created_at else None
        urls.append(_url(f"{BASE_URL}/product/{p.slug}", "weekly", "0.7", lm))

    # Catégories (Anniversaires, Mariages, Enfants, Personnalisés, Événements)
    res = await db.execute(select(Category).where(Category.published == True))
    for c in res.scalars().all():
        urls.append(_url(f"{BASE_URL}/catalog?category={c.slug}", "weekly", "0.6"))

    # Marques / Pâtisseries partenaires
    res = await db.execute(select(Brand).where(Brand.published == True))
    for b in res.scalars().all():
        urls.append(_url(f"{BASE_URL}/catalog?brand={b.slug}", "weekly", "0.6"))

    xml = '<?xml version="1.0" encoding="UTF-8"?>'
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    xml += "".join(urls)
    xml += "</urlset>"

    return Response(content=xml, media_type="application/xml")