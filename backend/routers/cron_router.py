import os
import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from database import AsyncSessionLocal
from models import Order, Product, Payment, Cart, Profile, PromoCode
from emails import tpl_review_request, tpl_cart_abandoned, send_templated
from utils import PUBLIC_BASE_URL

logger = logging.getLogger("strykos.cron")
router = APIRouter(prefix="/cron", tags=["cron"])

CRON_SECRET = os.environ.get("CRON_SECRET", "")
REVIEW_DELAY_DAYS = 5


def _verify_secret(x_cron_secret: str = Header(None, alias="X-Cron-Secret")):
    if not CRON_SECRET:
        raise HTTPException(status_code=500, detail="CRON_SECRET non configure")
    if x_cron_secret != CRON_SECRET:
        raise HTTPException(status_code=401, detail="Non autorise")


@router.post("/send-review-requests", dependencies=[Depends(_verify_secret)])
async def send_review_requests():
    """Envoie les emails d'invitation a laisser un avis. Idempotent (ne renvoie pas deja)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=REVIEW_DELAY_DAYS)
    sent = 0
    skipped = 0
    errors = []

    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(Order).where(
                Order.status == "delivered",
                Order.delivered_at.isnot(None),
                Order.delivered_at <= cutoff,
                Order.review_request_sent_at.is_(None),
                Order.email != "",
            ).limit(100)
        )
        orders = res.scalars().all()

        for o in orders:
            try:
                items = o.items or []
                product_ids = [it.get("product_id") for it in items if it.get("product_id")]
                if not product_ids:
                    o.review_request_sent_at = datetime.now(timezone.utc)
                    await db.commit()
                    skipped += 1
                    continue

                pres = await db.execute(
                    select(Product).where(Product.id.in_(product_ids))
                    .options(selectinload(Product.images))
                )
                products = []
                for p in pres.scalars().all():
                    raw_url = p.images[0].url if p.images else ""
                    # URL absolue pour le mail (les clients mail exigent des URLs absolues https)
                    if raw_url.startswith("/api/media/") and PUBLIC_BASE_URL.startswith("https://"):
                        abs_url = f"{PUBLIC_BASE_URL}{raw_url}"
                    else:
                        abs_url = raw_url
                    products.append({
                        "slug": p.slug,
                        "name_fr": p.name_fr,
                        "name_en": p.name_en,
                        "image_url": abs_url,
                    })

                if not products:
                    o.review_request_sent_at = datetime.now(timezone.utc)
                    await db.commit()
                    skipped += 1
                    continue

                lang = o.lang if o.lang in ("fr", "en") else "fr"
                subject, html = tpl_review_request(o.to_dict(), lang, products)
                await send_templated(
                    db, to=o.email, subject=subject, html=html,
                    template="review_request", order_id=o.id,
                )
                o.review_request_sent_at = datetime.now(timezone.utc)
                await db.commit()
                sent += 1
            except Exception as e:
                logger.warning(f"review_request failed for order {o.order_number}: {e}")
                errors.append({"order": o.order_number, "error": str(e)[:120]})

    return {"ok": True, "sent": sent, "skipped": skipped, "errors": errors}


@router.post("/cleanup-abandoned-orders", dependencies=[Depends(_verify_secret)])
async def cleanup_abandoned_orders():
    """Supprime les commandes jamais payees de +60 jours (pending ou cancelled)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=60)
    deleted = 0

    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(Order).where(
                Order.created_at <= cutoff,
                Order.payment_status == "pending",
                Order.status.in_(["pending_payment", "cancelled"]),
            ).limit(500)
        )
        orders = res.scalars().all()

        for o in orders:
            try:
                # Securite : ne jamais supprimer si un Payment a ete marque paid
                pays = (await db.execute(select(Payment).where(Payment.order_id == o.id))).scalars().all()
                if any(p.status == "paid" for p in pays):
                    continue
                for p in pays:
                    await db.delete(p)
                await db.delete(o)
                deleted += 1
            except Exception as e:
                logger.warning(f"cleanup failed for {o.order_number}: {e}")

        await db.commit()

    return {"ok": True, "deleted": deleted}


@router.post("/send-cart-reminders", dependencies=[Depends(_verify_secret)])
async def send_cart_reminders():
    """Envoie les emails de relance panier abandonne + nettoie les vieux paniers."""
    from emails import tpl_cart_abandoned, send_templated
    from utils import get_settings
    from sqlalchemy.orm import selectinload

    sent_1 = 0
    sent_2 = 0
    cleaned = 0
    errors = []

    async with AsyncSessionLocal() as db:
        # Charge les settings
        try:
            settings = await get_settings(db)
            cfg = (settings.get("cart_reminders") or {}) if settings else {}
        except Exception:
            cfg = {}
        if not cfg.get("enabled", True):
            return {"ok": True, "sent_1": 0, "sent_2": 0, "cleaned": 0, "skipped_reason": "disabled"}

        delay_1 = int(cfg.get("delay_1_hours", 4))
        delay_2 = int(cfg.get("delay_2_hours", 24))
        min_items = int(cfg.get("min_items", 1))
        promo_enabled = cfg.get("promo_on_second_email", True)
        promo_code = (cfg.get("promo_code") or "REVIENS5").strip().upper()

        now = datetime.now(timezone.utc)
        cutoff_1 = now - timedelta(hours=delay_1)
        cutoff_2 = now - timedelta(hours=delay_2)

        # Cree le code promo s'il n'existe pas (une seule fois)
        if promo_enabled and promo_code:
            existing = (await db.execute(select(PromoCode).where(PromoCode.code == promo_code))).scalar_one_or_none()
            if not existing:
                db.add(PromoCode(
                    code=promo_code,
                    description="Panier abandonne - 2e relance",
                    discount_type="percent",
                    value=int(cfg.get("promo_discount_percent", 5)),
                    active=True,
                ))
                await db.commit()

        # Nettoie les paniers de +30 jours
        from datetime import timedelta as _td
        cutoff_clean = now - _td(days=30)
        old_carts = (await db.execute(select(Cart).where(Cart.updated_at <= cutoff_clean))).scalars().all()
        for c in old_carts:
            await db.delete(c)
            cleaned += 1
        if cleaned:
            await db.commit()

        # Recupere les paniers a relancer
        carts = (await db.execute(
            select(Cart).where(
                Cart.reminder_opt_out == False,
                Cart.recovered_order_id.is_(None),
                Cart.updated_at <= cutoff_1,
            ).limit(100)
        )).scalars().all()

        for c in carts:
            try:
                items = c.items or []
                if len(items) < min_items:
                    continue

                user = (await db.execute(select(Profile).where(Profile.id == c.user_id))).scalar_one_or_none()
                if not user or not user.email:
                    continue

                lang = user.preferred_language if user.preferred_language in ("fr", "en") else "fr"
                u_dict = user.to_dict()

                # Prepare les items pour l'email (URL absolue des images)
                from utils import PUBLIC_BASE_URL as _PUB
                email_items = []
                for it in items:
                    img = it.get("image") or ""
                    if img.startswith("/api/media/") and _PUB.startswith("https://"):
                        img = f"{_PUB}{img}"
                    email_items.append({
                        "name_fr": it.get("name_fr"),
                        "name_en": it.get("name_en"),
                        "image_url": img,
                        "size": it.get("size"),
                        "quantity": it.get("quantity", 1),
                        "price": float(it.get("prices", {}).get("EUR", {}).get("price", 0) or 0),
                    })

                # Email 1 (H+delay_1)
                if not c.email_1_sent_at and c.updated_at <= cutoff_1 and (not c.email_2_sent_at):
                    subject, html = tpl_cart_abandoned(u_dict, email_items, lang, is_second=False)
                    await send_templated(db, to=user.email, subject=subject, html=html,
                                         template="cart_abandoned_1")
                    c.email_1_sent_at = now
                    await db.commit()
                    sent_1 += 1
                    continue

                # Email 2 (H+delay_2) avec code promo
                if c.email_1_sent_at and not c.email_2_sent_at and c.updated_at <= cutoff_2:
                    code_to_send = promo_code if promo_enabled else ""
                    subject, html = tpl_cart_abandoned(u_dict, email_items, lang, is_second=True, promo_code=code_to_send)
                    await send_templated(db, to=user.email, subject=subject, html=html,
                                         template="cart_abandoned_2")
                    c.email_2_sent_at = now
                    if promo_enabled:
                        c.promo_code_used = code_to_send
                    await db.commit()
                    sent_2 += 1
            except Exception as e:
                logger.warning(f"cart_reminder failed for user {c.user_id}: {e}")
                errors.append({"user_id": c.user_id, "error": str(e)[:120]})

    return {"ok": True, "sent_1": sent_1, "sent_2": sent_2, "cleaned": cleaned, "errors": errors}