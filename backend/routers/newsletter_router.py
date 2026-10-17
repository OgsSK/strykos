import asyncio
import logging
import secrets
from datetime import datetime, timezone
from html import escape
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db, AsyncSessionLocal
from models import NewsletterSubscriber, NewsletterCampaign, Product
from auth import get_current_user, get_optional_user, get_current_admin
from emails import send_templated, _layout, PUBLIC_BASE_URL, ADMIN_NOTIFY_EMAIL, _money
from utils import get_rates, serialize_product

logger = logging.getLogger("strykos.newsletter")
router = APIRouter(tags=["newsletter"])


def _unsub_link(sub: NewsletterSubscriber) -> str:
    return f"{PUBLIC_BASE_URL}/newsletter/unsubscribe?token={sub.token}"


def _unsub_footer(sub: NewsletterSubscriber, lang: str) -> str:
    txt = "Se désabonner de la newsletter" if lang == "fr" else "Unsubscribe from the newsletter"
    return f'<p style="margin:26px 0 0;font-size:12px;color:#888"><a href="{_unsub_link(sub)}" style="color:#888">{txt}</a></p>'


def tpl_welcome(sub: NewsletterSubscriber):
    lang = sub.lang if sub.lang in ("fr", "en") else "fr"
    if lang == "en":
        subject = "Welcome to the CAKESSHOP newsletter"
        body = ("<p>You're in! You'll be the first to know when new cakes, cupcakes and limited creations land on CAKESSHOP, "
                "plus exclusive promo codes for subscribers.</p>")
        cta = "Discover our latest creations"
    else:
        subject = "Bienvenue dans la newsletter CAKESSHOP"
        body = ("<p>C'est fait ! Vous serez prévenu en premier des nouveaux gâteaux, cupcakes et éditions limitées sur CAKESSHOP, "
                "avec des codes promo réservés aux abonnés.</p>")
        cta = "Découvrir nos nouveautés"
    if PUBLIC_BASE_URL.startswith("https://"):
        body += (f'<p style="margin:22px 0"><a href="{PUBLIC_BASE_URL}/catalog?is_new=true" style="background:#C58B58;color:#fff;text-decoration:none;'
                 f'padding:12px 22px;font-weight:bold;text-transform:uppercase;display:inline-block">{cta}</a></p>')
    body += _unsub_footer(sub, lang)
    return subject, _layout("Newsletter" if lang == "en" else "Newsletter", body, lang)


def tpl_campaign(camp: NewsletterCampaign, sub: NewsletterSubscriber, products: list[dict]):
    lang = sub.lang if sub.lang in ("fr", "en") else "fr"
    subject = (camp.subject_en if lang == "en" else camp.subject_fr) or camp.subject_fr or camp.subject_en
    text = (camp.body_en if lang == "en" else camp.body_fr) or camp.body_fr or camp.body_en
    body = "".join(f"<p>{escape(par)}</p>" for par in text.split("\n") if par.strip())
    if products:
        cells = ""
        for p in products[:6]:
            name = p["name_en"] if lang == "en" else p["name_fr"]
            # ⭐ Prix en FCFA (fallback EUR si XOF absent)
            price_block = p["prices"].get("XOF") or p["prices"].get("EUR") or {"price": 0}
            price_str = _money(price_block["price"], "XOF" if p["prices"].get("XOF") else "EUR")
            img = p["images"][0] if p.get("images") else ""
            url = f"{PUBLIC_BASE_URL}/product/{p['slug']}"
            cells += (f'<td width="33%" valign="top" style="padding:6px"><a href="{url}" style="text-decoration:none;color:#4A2C25">'
                      + (f'<img src="{escape(img)}" width="170" alt="" style="width:100%;display:block;background:#eee;border-radius:8px">' if img.startswith("https://") else "")
                      + f'<div style="font-size:13px;font-weight:bold;margin-top:6px">{escape(name)}</div>'
                      f'<div style="font-size:13px;color:#C58B58;font-weight:bold;margin-top:4px">{price_str}</div></a></td>')
        body += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0"><tr>' + cells + "</tr></table>"
    cta = (camp.cta_en if lang == "en" else camp.cta_fr) or "Découvrir"
    link = camp.cta_link or "/catalog"
    if not link.startswith("http"):
        link = f"{PUBLIC_BASE_URL}{link}"
    if link.startswith("https://"):
        body += (f'<p style="margin:22px 0"><a href="{escape(link)}" style="background:#C58B58;color:#fff;text-decoration:none;'
                 f'padding:12px 22px;font-weight:bold;text-transform:uppercase;display:inline-block">{escape(cta)}</a></p>')
    body += _unsub_footer(sub, lang)
    return subject, _layout(subject, body, lang)


# ---------------- Public ----------------
class SubscribeIn(BaseModel):
    email: EmailStr
    lang: str = "fr"
    source: str = "footer"


@router.post("/newsletter/subscribe")
async def subscribe(data: SubscribeIn, db: AsyncSession = Depends(get_db), user=Depends(get_optional_user)):
    email = data.email.lower().strip()
    lang = data.lang if data.lang in ("fr", "en") else "fr"
    sub = (await db.execute(select(NewsletterSubscriber).where(NewsletterSubscriber.email == email))).scalar_one_or_none()
    created = False
    if sub:
        if sub.active:
            return {"ok": True, "already": True}
        sub.active, sub.unsubscribed_at, sub.lang = True, None, lang
        if user:
            sub.user_id = user.id
    else:
        sub = NewsletterSubscriber(email=email, lang=lang, token=secrets.token_urlsafe(32), source=data.source[:40],
                                   user_id=user.id if user else None)
        db.add(sub)
        created = True
    await db.commit()
    await db.refresh(sub)
    subject, html = tpl_welcome(sub)
    await send_templated(db, to=sub.email, subject=subject, html=html, template="newsletter_welcome")
    return {"ok": True, "created": created}


class UnsubIn(BaseModel):
    token: Optional[str] = None


@router.post("/newsletter/unsubscribe")
async def unsubscribe(data: UnsubIn, db: AsyncSession = Depends(get_db), user=Depends(get_optional_user)):
    sub = None
    if data.token:
        sub = (await db.execute(select(NewsletterSubscriber).where(NewsletterSubscriber.token == data.token))).scalar_one_or_none()
    elif user:
        sub = (await db.execute(select(NewsletterSubscriber).where(
            or_(NewsletterSubscriber.user_id == user.id, NewsletterSubscriber.email == user.email)))).scalars().first()
    if not sub:
        raise HTTPException(status_code=404, detail="Abonnement introuvable")
    sub.active = False
    sub.unsubscribed_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True, "email": sub.email}


@router.get("/newsletter/status")
async def newsletter_status(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    sub = (await db.execute(select(NewsletterSubscriber).where(
        or_(NewsletterSubscriber.user_id == user.id, NewsletterSubscriber.email == user.email)))).scalars().first()
    return {"subscribed": bool(sub and sub.active), "email": sub.email if sub else user.email}


# ---------------- Admin ----------------
admin = APIRouter(prefix="/admin/newsletter", dependencies=[Depends(get_current_admin)])


# ⭐ CORRIGÉ : pagination + filtres serveur + rétrocompat
@admin.get("/subscribers")
async def list_subscribers(
    q: Optional[str] = None,
    active: Optional[bool] = None,
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """Liste paginée des abonnés newsletter + total global actif."""
    base_q = select(NewsletterSubscriber)
    count_q = select(func.count(NewsletterSubscriber.id))

    # Filtre recherche
    if q:
        term = f"%{q.strip()}%"
        base_q = base_q.where(NewsletterSubscriber.email.ilike(term))
        count_q = count_q.where(NewsletterSubscriber.email.ilike(term))

    # Filtre état (actif/inactif) — cohérent avec le paramètre existant
    if active is not None:
        base_q = base_q.where(NewsletterSubscriber.active == active)
        count_q = count_q.where(NewsletterSubscriber.active == active)

    # Total de la requête courante (filtrée par q + active)
    total = (await db.execute(count_q)).scalar() or 0

    # ⭐ Total actif GLOBAL (jamais filtré par q, toujours vrai)
    total_active = (await db.execute(
        select(func.count(NewsletterSubscriber.id)).where(NewsletterSubscriber.active == True)
    )).scalar() or 0

    base_q = (
        base_q
        .order_by(NewsletterSubscriber.created_at.desc())
        .offset(max(0, offset))
        .limit(min(limit, 500))
    )
    res = await db.execute(base_q)
    items = [s.to_dict() for s in res.scalars().all()]

    return {
        "items": items,
        "subscribers": items,          # ⭐ rétrocompat avec l'ancien frontend
        "total": total,                # nb filtré (q + active)
        "total_active": total_active,  # nb actif global (compteur header)
        "limit": limit,
        "offset": offset,
    }


class AdminSubIn(BaseModel):
    email: EmailStr
    lang: str = "fr"


@admin.post("/subscribers")
async def admin_add_subscriber(data: AdminSubIn, db: AsyncSession = Depends(get_db)):
    email = data.email.lower().strip()
    sub = (await db.execute(select(NewsletterSubscriber).where(NewsletterSubscriber.email == email))).scalar_one_or_none()
    if sub:
        sub.active, sub.unsubscribed_at = True, None
    else:
        db.add(NewsletterSubscriber(email=email, lang=data.lang if data.lang in ("fr", "en") else "fr",
                                    token=secrets.token_urlsafe(32), source="admin"))
    await db.commit()
    return {"ok": True}


@admin.put("/subscribers/{sub_id}")
async def admin_toggle_subscriber(sub_id: str, data: dict, db: AsyncSession = Depends(get_db)):
    sub = (await db.execute(select(NewsletterSubscriber).where(NewsletterSubscriber.id == sub_id))).scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Abonne introuvable")
    sub.active = bool(data.get("active", True))
    sub.unsubscribed_at = None if sub.active else datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True, "active": sub.active}


@admin.delete("/subscribers/{sub_id}")
async def admin_delete_subscriber(sub_id: str, db: AsyncSession = Depends(get_db)):
    sub = (await db.execute(select(NewsletterSubscriber).where(NewsletterSubscriber.id == sub_id))).scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Abonne introuvable")
    await db.delete(sub)
    await db.commit()
    return {"ok": True}


@admin.get("/subscribers.csv")
async def export_subscribers(db: AsyncSession = Depends(get_db)):
    from routers.admin_router import _csv_response
    subs = (await db.execute(select(NewsletterSubscriber).order_by(NewsletterSubscriber.created_at.desc()))).scalars().all()
    rows = [[s.email, s.lang, "oui" if s.active else "non", s.source, s.created_at.strftime("%Y-%m-%d") if s.created_at else ""] for s in subs]
    return _csv_response(rows, ["Email", "Langue", "Actif", "Source", "Inscrit le"], "strykos-newsletter.csv")


class CampaignIn(BaseModel):
    name: str = ""
    subject_fr: str
    subject_en: str = ""
    body_fr: str
    body_en: str = ""
    product_slugs: list[str] = []
    cta_link: str = "/catalog?is_new=true"
    cta_fr: str = "Découvrir"
    cta_en: str = "Shop now"


@admin.get("/campaigns")
async def list_campaigns(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(NewsletterCampaign).order_by(NewsletterCampaign.created_at.desc()))
    return [c.to_dict() for c in res.scalars().all()]


@admin.post("/campaigns")
async def create_campaign(data: CampaignIn, db: AsyncSession = Depends(get_db)):
    c = NewsletterCampaign(**data.model_dump())
    db.add(c)
    await db.commit()
    return {"ok": True, "id": c.id}


@admin.put("/campaigns/{cid}")
async def update_campaign(cid: str, data: CampaignIn, db: AsyncSession = Depends(get_db)):
    c = (await db.execute(select(NewsletterCampaign).where(NewsletterCampaign.id == cid))).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    if c.status != "draft":
        raise HTTPException(status_code=400, detail="Une campagne envoyee ne peut plus etre modifiee")
    for k, v in data.model_dump().items():
        setattr(c, k, v)
    await db.commit()
    return {"ok": True}


@admin.delete("/campaigns/{cid}")
async def delete_campaign(cid: str, db: AsyncSession = Depends(get_db)):
    c = (await db.execute(select(NewsletterCampaign).where(NewsletterCampaign.id == cid))).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    await db.delete(c)
    await db.commit()
    return {"ok": True}


async def _campaign_products(db, slugs):
    if not slugs:
        return []
    rates = await get_rates(db)
    res = await db.execute(select(Product).where(Product.slug.in_(slugs), Product.published == True)
                           .options(selectinload(Product.images), selectinload(Product.brand),
                                    selectinload(Product.category), selectinload(Product.variants)))
    prods = {p.slug: serialize_product(p, rates) for p in res.scalars().unique().all()}
    return [prods[s] for s in slugs if s in prods]


@admin.post("/campaigns/{cid}/test")
async def test_campaign(cid: str, admin_user=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    c = (await db.execute(select(NewsletterCampaign).where(NewsletterCampaign.id == cid))).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    products = await _campaign_products(db, c.product_slugs or [])
    fake = NewsletterSubscriber(email=admin_user.email, lang="fr", token="test")
    subject, html = tpl_campaign(c, fake, products)
    log = await send_templated(db, to=ADMIN_NOTIFY_EMAIL or admin_user.email, subject=f"[TEST] {subject}", html=html, template="newsletter_campaign_test")
    if log.status != "sent":
        raise HTTPException(status_code=502, detail=f"Envoi test echoue: {log.error[:200] or log.status}")
    return {"ok": True, "to": log.to_email}


async def _send_campaign_job(cid: str):
    async with AsyncSessionLocal() as db:
        c = (await db.execute(select(NewsletterCampaign).where(NewsletterCampaign.id == cid))).scalar_one_or_none()
        if not c:
            return
        products = await _campaign_products(db, c.product_slugs or [])
        subs = (await db.execute(select(NewsletterSubscriber).where(NewsletterSubscriber.active == True))).scalars().all()
        c.total_recipients = len(subs)
        await db.commit()
        sent = failed = 0
        for sub in subs:
            try:
                subject, html = tpl_campaign(c, sub, products)
                log = await send_templated(db, to=sub.email, subject=subject, html=html, template="newsletter_campaign")
                if log.status == "sent":
                    sent += 1
                else:
                    failed += 1
            except Exception as e:
                logger.warning(f"campaign send failed for {sub.email}: {e}")
                failed += 1
            c.sent_count, c.failed_count = sent, failed
            await db.commit()
            await asyncio.sleep(0.4)
        c.status = "sent" if sent or not subs else "failed"
        c.sent_at = datetime.now(timezone.utc)
        await db.commit()


@admin.post("/campaigns/{cid}/send")
async def send_campaign(cid: str, db: AsyncSession = Depends(get_db)):
    c = (await db.execute(select(NewsletterCampaign).where(NewsletterCampaign.id == cid))).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Campagne introuvable")
    if c.status != "draft":
        raise HTTPException(status_code=400, detail="Campagne deja envoyee")
    if not c.subject_fr or not c.body_fr:
        raise HTTPException(status_code=400, detail="Sujet et texte FR requis")
    count = (await db.execute(select(func.count(NewsletterSubscriber.id)).where(NewsletterSubscriber.active == True))).scalar() or 0
    c.status = "sending"
    c.total_recipients = count
    await db.commit()
    asyncio.create_task(_send_campaign_job(cid))
    return {"ok": True, "recipients": count}


router.include_router(admin)