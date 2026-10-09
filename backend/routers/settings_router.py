from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from utils import get_settings, SUPPORTED_CURRENCIES, resolve_media

router = APIRouter(tags=["settings"])


@router.get("/settings")
async def public_settings(db: AsyncSession = Depends(get_db)):
    s = await get_settings(db)
    providers = s.get("payment_providers", {})
    enabled_providers = {k: {"enabled": v.get("enabled", False), "currencies": v.get("currencies", []),
                             "countries": v.get("countries", [])}
                         for k, v in providers.items()}
    hero = dict(s.get("hero") or {})
    hero["slides"] = [{**sl, "video_url": resolve_media(sl.get("video_url", "")), "image_url": resolve_media(sl.get("image_url", ""))}
                      for sl in (hero.get("slides") or [])]
    sections = {k: {**v, "video_url": resolve_media(v.get("video_url", "")), "image_url": resolve_media(v.get("image_url", ""))}
                for k, v in (s.get("sections") or {}).items()}
    return {
        "sections": sections,
        "currency": s.get("currency"),
        "currencies": SUPPORTED_CURRENCIES,
        "info_bar": s.get("info_bar"),
        "hero": hero,
        "shipping": s.get("shipping"),
        "site": s.get("site"),
        "payment_providers": enabled_providers,
    }
