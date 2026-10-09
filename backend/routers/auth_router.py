from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import Profile, UserAddress
from auth import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterInput(BaseModel):
    email: EmailStr
    password: str
    first_name: str = ""
    last_name: str = ""
    phone: str = ""


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class ProfileUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    preferred_language: str | None = None


def _auth_response(user: Profile, response: Response):
    token = create_access_token(user.id, user.email, user.role)
    response.set_cookie("access_token", token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    return {"token": token, "user": user.to_dict()}


@router.post("/register")
async def register(data: RegisterInput, response: Response, db: AsyncSession = Depends(get_db)):
    email = data.email.lower().strip()
    existing = await db.execute(select(Profile).where(Profile.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Un compte existe deja avec cet e-mail")
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 6 caracteres")
    user = Profile(
        email=email, password_hash=hash_password(data.password),
        first_name=data.first_name, last_name=data.last_name, phone=data.phone,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return _auth_response(user, response)


@router.post("/login")
async def login(data: LoginInput, response: Response, db: AsyncSession = Depends(get_db)):
    email = data.email.lower().strip()
    result = await db.execute(select(Profile).where(Profile.email == email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="E-mail ou mot de passe incorrect")
    return _auth_response(user, response)


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@router.get("/me")
async def me(user: Profile = Depends(get_current_user)):
    return user.to_dict()


@router.put("/me")
async def update_me(data: ProfileUpdate, user: Profile = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    for field in ["first_name", "last_name", "phone", "preferred_language"]:
        val = getattr(data, field)
        if val is not None:
            setattr(user, field, val)
    await db.commit()
    await db.refresh(user)
    return user.to_dict()


# ---- Addresses ----
class AddressInput(BaseModel):
    label: str = ""
    first_name: str = ""
    last_name: str = ""
    phone: str = ""
    country: str = ""
    city: str = ""
    address_line: str = ""
    postal_code: str = ""
    is_default: bool = False


@router.get("/addresses")
async def list_addresses(user: Profile = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserAddress).where(UserAddress.user_id == user.id))
    return [a.to_dict() for a in result.scalars().all()]


@router.post("/addresses")
async def add_address(data: AddressInput, user: Profile = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    addr = UserAddress(user_id=user.id, **data.model_dump())
    db.add(addr)
    await db.commit()
    await db.refresh(addr)
    return addr.to_dict()


@router.delete("/addresses/{address_id}")
async def delete_address(address_id: str, user: Profile = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserAddress).where(UserAddress.id == address_id, UserAddress.user_id == user.id))
    addr = result.scalar_one_or_none()
    if not addr:
        raise HTTPException(status_code=404, detail="Adresse introuvable")
    await db.delete(addr)
    await db.commit()
    return {"ok": True}


# ---------------- Password reset ----------------
import secrets
import hashlib
from datetime import datetime, timezone, timedelta
from html import escape
from models import PasswordResetToken
from emails import send_templated, _layout, PUBLIC_BASE_URL


class ForgotInput(BaseModel):
    email: EmailStr
    lang: str = "fr"


class ResetInput(BaseModel):
    token: str
    password: str


def _tpl_reset(user: Profile, link: str, lang: str):
    first = escape(user.first_name or "")
    if lang == "en":
        subject = "Reset your STRYKOS password"
        body = (f"<p>Hi {first},</p><p>We received a request to reset the password of your STRYKOS account. "
                f"This link is valid for 1 hour and can be used once.</p>"
                f'<p style="margin:22px 0"><a href="{link}" style="background:#e4002b;color:#fff;text-decoration:none;padding:12px 22px;font-weight:bold;text-transform:uppercase;display:inline-block">Choose a new password</a></p>'
                "<p style=\"color:#777;font-size:13px\">If you did not request this, you can ignore this email: your password stays unchanged.</p>")
        title = "Password reset"
    else:
        subject = "Réinitialisation de votre mot de passe STRYKOS"
        body = (f"<p>Bonjour {first},</p><p>Nous avons reçu une demande de réinitialisation du mot de passe de votre compte STRYKOS. "
                f"Ce lien est valable 1 heure et utilisable une seule fois.</p>"
                f'<p style="margin:22px 0"><a href="{link}" style="background:#e4002b;color:#fff;text-decoration:none;padding:12px 22px;font-weight:bold;text-transform:uppercase;display:inline-block">Choisir un nouveau mot de passe</a></p>'
                "<p style=\"color:#777;font-size:13px\">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : votre mot de passe reste inchangé.</p>")
        title = "Mot de passe oublié"
    return subject, _layout(title, body, lang)


@router.post("/forgot-password")
async def forgot_password(data: ForgotInput, db: AsyncSession = Depends(get_db)):
    email = data.email.lower().strip()
    user = (await db.execute(select(Profile).where(Profile.email == email))).scalar_one_or_none()
    # Always answer OK to avoid account enumeration
    if user:
        recent = await db.execute(select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id, PasswordResetToken.used == False,
            PasswordResetToken.created_at > datetime.now(timezone.utc) - timedelta(minutes=2)))
        if recent.scalars().first():
            return {"ok": True}
        raw = secrets.token_urlsafe(32)
        db.add(PasswordResetToken(user_id=user.id, token_hash=hashlib.sha256(raw.encode()).hexdigest(),
                                  expires_at=datetime.now(timezone.utc) + timedelta(hours=1)))
        await db.commit()
        link = f"{PUBLIC_BASE_URL}/reset-password?token={raw}"
        lang = data.lang if data.lang in ("fr", "en") else "fr"
        subject, html = _tpl_reset(user, link, lang)
        await send_templated(db, to=user.email, subject=subject, html=html, template="password_reset")
    return {"ok": True}


@router.post("/reset-password")
async def reset_password(data: ResetInput, db: AsyncSession = Depends(get_db)):
    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 8 caracteres")
    th = hashlib.sha256(data.token.encode()).hexdigest()
    tok = (await db.execute(select(PasswordResetToken).where(PasswordResetToken.token_hash == th))).scalar_one_or_none()
    if not tok or tok.used or tok.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Lien invalide ou expire")
    user = (await db.execute(select(Profile).where(Profile.id == tok.user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="Lien invalide ou expire")
    user.password_hash = hash_password(data.password)
    tok.used = True
    await db.commit()
    return {"ok": True}
