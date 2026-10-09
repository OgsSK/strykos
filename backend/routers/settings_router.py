from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from utils import get_settings, SUPPORTED_CURRENCIES

router = APIRouter(tags=["settings"])


@router.get("/settings")
async def public_settings(db: AsyncSession = Depends(get_db)):
    s = await get_settings(db)
    providers = s.get("payment_providers", {})
    enabled_providers = {k: {"enabled": v.get("enabled", False), "currencies": v.get("currencies", []),
                             "countries": v.get("countries", [])}
                         for k, v in providers.items()}
    return {
        "currency": s.get("currency"),
        "currencies": SUPPORTED_CURRENCIES,
        "info_bar": s.get("info_bar"),
        "hero": s.get("hero"),
        "shipping": s.get("shipping"),
        "site": s.get("site"),
        "payment_providers": enabled_providers,
    }
