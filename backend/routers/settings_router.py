from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from utils import get_settings, SUPPORTED_CURRENCIES, resolve_media

router = APIRouter(tags=["settings"])

# Valeurs par défaut pour le bloc "orders" (fallback si rien en base
# ET fusion pour garantir la présence des nouveaux champs)
_DEFAULT_ORDERS = {
    "min_lead_hours": 48,
    "max_advance_days": 180,
    "time_slots": [
        {"value": "matin",      "label_fr": "Matin (9h-12h)",       "label_en": "Morning (9am-12pm)"},
        {"value": "apres-midi", "label_fr": "Après-midi (14h-18h)", "label_en": "Afternoon (2pm-6pm)"},
        {"value": "soir",       "label_fr": "Soirée (18h-20h)",     "label_en": "Evening (6pm-8pm)"},
    ],
    "weekly_closed_days": [],
    "closed_dates": [],
    "closed_ranges": [],
    "special_days": [],
    # ⭐ NOUVEAU : réclamations
    "claim_window_hours": 48,           # Délai pour signaler un problème (heures)
    "claim_media_max_photos": 3,        # Nombre max de photos
    "claim_media_max_videos": 1,        # Nombre max de vidéos
    "claim_media_max_photo_mb": 5,      # Taille max photo (Mo)
    "claim_media_max_video_mb": 20,     # Taille max vidéo (Mo)
}


def _resolve_section(v):
    """Résout les médias d'une section (image/video + cards)."""
    return {
        **v,
        "video_url": resolve_media(v.get("video_url", "")),
        "image_url": resolve_media(v.get("image_url", "")),
        "cards": [
            {**c,
             "video_url": resolve_media(c.get("video_url", "")),
             "image_url": resolve_media(c.get("image_url", ""))}
            for c in (v.get("cards") or [])
        ],
    }


def _resolve_orders(orders_from_db: dict | None) -> dict:
    """Fusionne les valeurs DB avec les défauts pour garantir la présence
    de tous les champs (même sur une installation existante)."""
    if not orders_from_db:
        return dict(_DEFAULT_ORDERS)
    # On part des défauts puis on écrase avec ce qui est en base.
    # Pour chaque clé, la valeur DB est prioritaire SAUF si elle est None.
    merged = {**_DEFAULT_ORDERS}
    for k, v in orders_from_db.items():
        if v is not None:
            merged[k] = v
    # Cas particulier : si DB a un time_slots vide [], on garde le vide
    # (l'admin peut volontairement désactiver les créneaux)
    if isinstance(orders_from_db.get("time_slots"), list):
        merged["time_slots"] = orders_from_db["time_slots"]
    return merged


@router.get("/settings")
async def public_settings(db: AsyncSession = Depends(get_db)):
    s = await get_settings(db)

    providers = s.get("payment_providers", {})
    enabled_providers = {
        k: {"enabled": v.get("enabled", False),
            "currencies": v.get("currencies", []),
            "countries": v.get("countries", [])}
        for k, v in providers.items()
    }

    # Hero
    hero = dict(s.get("hero") or {})
    hero["slides"] = [
        {**sl,
         "video_url": resolve_media(sl.get("video_url", "")),
         "image_url": resolve_media(sl.get("image_url", ""))}
        for sl in (hero.get("slides") or [])
    ]

    # Sections (new_arrivals, promotions, categories, editorial, ...)
    sections = {k: _resolve_section(v) for k, v in (s.get("sections") or {}).items()}

    # Icons (catégories rondes)
    icons = dict(s.get("icons") or {})
    icons["items"] = [
        {**it, "image_url": resolve_media(it.get("image_url", ""))}
        for it in (icons.get("items") or [])
    ]

    # CTA Banner
    cta_banner = dict(s.get("cta_banner") or {})
    if cta_banner:
        cta_banner["image_url"] = resolve_media(cta_banner.get("image_url", ""))
        cta_banner["video_url"] = resolve_media(cta_banner.get("video_url", ""))

    # Story Block
    story = dict(s.get("story") or {})
    if story:
        story["image_url"] = resolve_media(story.get("image_url", ""))

    # Gallery
    gallery = dict(s.get("gallery") or {})
    if gallery:
        gallery["items"] = [
            {**it, "image_url": resolve_media(it.get("image_url", ""))}
            for it in (gallery.get("items") or [])
        ]

    return {
        "sections": sections,
        "icons": icons,
        "currency": s.get("currency"),
        "currencies": SUPPORTED_CURRENCIES,
        "info_bar": s.get("info_bar"),
        "hero": hero,
        "shipping": s.get("shipping"),
        "site": s.get("site"),
        "payment_providers": enabled_providers,
        # ⭐ NOUVEAU : paiement à la livraison (COD)
        "payment_methods": s.get("payment_methods") or {
            "cod": {
                "enabled": False,
                "label_fr": "Payer à la livraison",
                "label_en": "Pay on delivery",
                "instructions_fr": "",
                "instructions_en": "",
                "countries": ["ML"],
                "min_amount_xof": 0,
                "max_amount_xof": 500000,
                "extra_fee_xof": 0,
                "mode": "all",
                "refund_methods": ["cash", "mobile_money", "promo"],
                "promo_validity_days": 180,
            },
        },
        # --- Sections home ---
        "features": s.get("features"),
        "testimonials": s.get("testimonials"),
        "cta_banner": cta_banner,
        "story": story,
        "steps": s.get("steps"),
        "gallery": gallery,
        # ⭐ Commandes programmées : fusion défauts + DB pour garantir
        # tous les champs même sur une installation existante
        "orders": _resolve_orders(s.get("orders")),
    }