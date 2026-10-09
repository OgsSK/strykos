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
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[os.environ.get("FRONTEND_URL", "*"), "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    try:
        async with AsyncSessionLocal() as db:
            # default settings
            for key, value in DEFAULT_SETTINGS.items():
                res = await db.execute(select(Setting).where(Setting.key == key))
                if not res.scalar_one_or_none():
                    db.add(Setting(key=key, value=value))
            # admin seed
            admin_email = os.environ.get("ADMIN_EMAIL", "admin@strykos.com").lower()
            admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
            res = await db.execute(select(Profile).where(Profile.email == admin_email))
            admin = res.scalar_one_or_none()
            if not admin:
                db.add(Profile(email=admin_email, password_hash=hash_password(admin_password),
                               first_name="Admin", last_name="STRYKOS", role="admin"))
            elif not verify_password(admin_password, admin.password_hash):
                admin.password_hash = hash_password(admin_password)
            await db.commit()
        logger.info("Startup seeding complete")
    except Exception as e:
        logger.warning(f"Startup seeding skipped: {e}")
