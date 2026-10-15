import os
import jwt
import bcrypt
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Request, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import Profile

JWT_ALGORITHM = "HS256"


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id, "email": email, "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


# ⭐ NOUVEAU : token JWT pour confirmation d'email (24h)
def create_email_confirm_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "type": "email_confirm",
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_email_confirm_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "email_confirm":
            return None
        return payload
    except Exception:
        return None


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> Profile:
    token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    result = await db.execute(select(Profile).where(Profile.id == payload["sub"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def get_current_admin(user: Profile = Depends(get_current_user)) -> Profile:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def get_optional_user(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        return await get_current_user(request, db)
    except HTTPException:
        return None


# ================================================================
# ⭐ Tokens d'invitation livreur
# ================================================================

def create_driver_invite_token(user_id: str, email: str) -> str:
    """Token JWT pour invitation livreur, valable 7 jours."""
    payload = {
        "sub": user_id,
        "email": email,
        "type": "driver_invite",
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_driver_invite_token(token: str) -> dict | None:
    """Décode et valide un token d'invitation livreur."""
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "driver_invite":
            return None
        return payload
    except Exception:
        return None


async def get_current_driver(request: Request, db: AsyncSession = Depends(get_db)) -> Profile:
    """Dépendance FastAPI : exige que l'utilisateur connecté soit un driver."""
    user = await get_current_user(request, db)
    if user.role != "driver":
        raise HTTPException(status_code=403, detail="Accès réservé aux livreurs")
    return user