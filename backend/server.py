from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / '.env')

import os
import logging
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from sqlalchemy import select

from database import AsyncSessionLocal
from models import Profile, Setting
from auth import hash_password, verify_password
from utils import DEFAULT_SETTINGS

from routers.auth_router import router as auth_router
from routers.catalog_router import router as catalog_router
from routers.commerce_router import router as commerce_router
from routers.admin_router import router as admin_router
from routers.settings_router import router as settings_router
from routers.media_router import router as media_router
from routers.reviews_router import router as reviews_router
from routers.newsletter_router import router as newsletter_router
from routers.contact_router import router as contact_router
from routers.cart_router import router as cart_router
from fastapi import Request
from storage import init_storage
from routers.cron_router import router as cron_router


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("strykos")

app = FastAPI(title="STRYKOS API")
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "STRYKOS API", "status": "ok"}


api_router.include_router(auth_router)
api_router.include_router(catalog_router)
api_router.include_router(commerce_router)
api_router.include_router(admin_router)
api_router.include_router(settings_router)
api_router.include_router(media_router)
api_router.include_router(reviews_router)
api_router.include_router(newsletter_router)
api_router.include_router(contact_router)
api_router.include_router(cart_router)
api_router.include_router(cron_router)
app.include_router(api_router)


PUBLIC_CACHE_PREFIXES = ("/api/settings", "/api/home", "/api/products", "/api/categories", "/api/brands", "/api/search")


@app.middleware("http")
async def public_cache_headers(request: Request, call_next):
    response = await call_next(request)
    if (request.method == "GET" and request.url.path.startswith(PUBLIC_CACHE_PREFIXES)
            and "authorization" not in request.headers and response.status_code == 200
            and "/reviews" not in request.url.path):
        response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=600"
    return response


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
)


@app.on_event("startup")
async def startup():
    try:
        init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.warning(f"Object storage init failed: {e}")
    try:
        async with AsyncSessionLocal() as db:
            # default settings
            for key, value in DEFAULT_SETTINGS.items():
                res = await db.execute(select(Setting).where(Setting.key == key))
                row = res.scalar_one_or_none()
                if not row:
                    db.add(Setting(key=key, value=value))
                elif key == "site" and row.value.get("email") == "contact@actoos.com":
                    row.value = {**value, **{k: v for k, v in row.value.items() if k not in ("email", "phone")}}
                elif key == "hero" and "slides" not in (row.value or {}):
                    old = row.value or {}
                    first = {**value["slides"][0], **{k: old[k] for k in ("title_fr", "title_en", "subtitle_fr", "subtitle_en", "cta_fr", "cta_en", "cta_link") if old.get(k)}}
                    row.value = {"interval_ms": 7000, "slides": [first] + value["slides"][1:]}
            # admin seed (idempotent: only creates the admin when missing)
            admin_email = os.environ.get("ADMIN_EMAIL", "admin@strykos.com").lower()
            admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
            res = await db.execute(select(Profile).where(Profile.email == admin_email))
            admin = res.scalar_one_or_none()
            if not admin:
                legacy = (await db.execute(select(Profile).where(Profile.role == "admin").order_by(Profile.created_at))).scalars().first()
                if legacy and legacy.email != admin_email:
                    legacy.email = admin_email
                    legacy.password_hash = hash_password(admin_password)
                else:
                    db.add(Profile(email=admin_email, password_hash=hash_password(admin_password),
                                   first_name="Admin", last_name="STRYKOS", role="admin"))
            elif not verify_password(admin_password, admin.password_hash):
                admin.password_hash = hash_password(admin_password)
            await db.commit()
        logger.info("Startup seeding complete")
    except Exception as e:
        logger.warning(f"Startup seeding skipped: {e}")