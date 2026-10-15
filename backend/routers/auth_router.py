from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import Profile, UserAddress, NewsletterSubscriber
from auth import (
    hash_password, verify_password, create_access_token, get_current_user,
    create_email_confirm_token, decode_email_confirm_token,
)
from emails import send_templated, _layout, PUBLIC_BASE_URL, tpl_email_change_old, tpl_email_change_new
from models import EmailChangeRequest

import re
import secrets
import hashlib
from datetime import datetime, timezone, timedelta
from html import escape
from models import PasswordResetToken

router = APIRouter(prefix="/auth", tags=["auth"])


# ==================== Helpers mot de passe ====================
def password_strength(pwd: str) -> dict:
    """Evalue un mot de passe. Retourne score (0-5), label, criteria."""
    if not pwd:
        return {"score": 0, "label": "empty", "criteria": {}}
    criteria = {
        "length_8": len(pwd) >= 8,
        "length_12": len(pwd) >= 12,
        "has_lower": bool(re.search(r"[a-z]", pwd)),
        "has_upper": bool(re.search(r"[A-Z]", pwd)),
        "has_digit": bool(re.search(r"\d", pwd)),
        "has_special": bool(re.search(r"[^A-Za-z0-9]", pwd)),
    }
    score = 0
    if criteria["length_8"]: score += 1
    if criteria["length_12"]: score += 1
    if criteria["has_lower"] and criteria["has_upper"]: score += 1
    if criteria["has_digit"]: score += 1
    if criteria["has_special"]: score += 1

    labels = ["very_weak", "weak", "fair", "good", "strong", "excellent"]
    return {"score": min(score, 5), "label": labels[min(score, 5)], "criteria": criteria}


def validate_password(pwd: str) -> None:
    if len(pwd) < 8:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 8 caracteres")
    if not re.search(r"[A-Za-z]", pwd):
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins une lettre")
    if not re.search(r"\d", pwd):
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins un chiffre")


# ==================== Schémas ====================
class RegisterInput(BaseModel):
    email: EmailStr
    password: str
    first_name: str = ""
    last_name: str = ""
    phone: str = ""
    lang: str = "fr"


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class ProfileUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    preferred_language: str | None = None


class ConfirmEmailIn(BaseModel):
    token: str


# ==================== Utils ====================
def _auth_response(user: Profile, response: Response):
    token = create_access_token(user.id, user.email, user.role)
    response.set_cookie("access_token", token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    return {"token": token, "user": user.to_dict()}


def _tpl_welcome(user: Profile, lang: str, confirm_token: str):
    """Template du mail d'inscription : demande de confirmation d'email."""
    first = escape(user.first_name or "")
    confirm_url = f"{PUBLIC_BASE_URL}/confirm-email?token={confirm_token}"
    if lang == "en":
        subject = "Confirm your CAKESSHOP account"
        body = (f"<p>Hi {first},</p>"
                "<p>Welcome to CAKESSHOP — your artisan bakery, handmade with passion.</p>"
                "<p>To activate your account, please confirm your email address by clicking below. "
                "This link is valid for 24 hours.</p>"
                f'<p style="margin:22px 0"><a href="{confirm_url}" '
                f'style="background:#C58B58;color:#fff;text-decoration:none;padding:14px 26px;'
                f'font-weight:bold;text-transform:uppercase;display:inline-block;letter-spacing:.5px">Confirm my account</a></p>'
                "<p>Once confirmed, you can log in and start ordering.</p>"
                "<p style='color:#777;font-size:13px'>If you did not create an account, you can ignore this email.</p>")
        title = "Confirm your account"
    else:
        subject = "Confirmez votre compte CAKESSHOP"
        body = (f"<p>Bonjour {first},</p>"
                "<p>Bienvenue chez CAKESSHOP — votre pâtisserie artisanale, faite maison avec passion.</p>"
                "<p>Pour activer votre compte, merci de confirmer votre adresse e-mail en cliquant ci-dessous. "
                "Ce lien est valable 24 heures.</p>"
                f'<p style="margin:22px 0"><a href="{confirm_url}" '
                f'style="background:#C58B58;color:#fff;text-decoration:none;padding:14px 26px;'
                f'font-weight:bold;text-transform:uppercase;display:inline-block;letter-spacing:.5px">Confirmer mon compte</a></p>'
                "<p>Une fois confirmé, vous pourrez vous connecter et passer commande.</p>"
                "<p style='color:#777;font-size:13px'>Si vous n'êtes pas à l'origine de cette inscription, ignorez cet e-mail.</p>")
        title = "Confirmez votre compte"
    return subject, _layout(title, body, lang)


# ==================== Routes ====================
@router.post("/register")
async def register(data: RegisterInput, db: AsyncSession = Depends(get_db)):
    """Inscription : crée le compte + envoie un email de confirmation.
    ⭐ NE CONNECTE PAS automatiquement : l'utilisateur doit confirmer son email."""
    email = data.email.lower().strip()
    existing = await db.execute(select(Profile).where(Profile.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Un compte existe deja avec cet e-mail")
    validate_password(data.password)
    user = Profile(
        email=email, password_hash=hash_password(data.password),
        first_name=data.first_name, last_name=data.last_name, phone=data.phone,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Génère le token de confirmation (JWT 24h)
    confirm_token = create_email_confirm_token(user.id, user.email)

    # Envoie l'email de confirmation (ne bloque jamais l'inscription)
    lang = data.lang if data.lang in ("fr", "en") else "fr"
    try:
        subject, html = _tpl_welcome(user, lang, confirm_token)
        await send_templated(db, to=user.email, subject=subject, html=html, template="welcome")
    except Exception:
        pass

    return {
        "ok": True,
        "requires_confirmation": True,
        "email": user.email,
        "message": "Vérifiez votre boîte mail pour confirmer votre compte.",
    }


@router.post("/confirm-email")
async def confirm_email(data: ConfirmEmailIn, response: Response, db: AsyncSession = Depends(get_db)):
    """Valide le token de confirmation et connecte automatiquement l'utilisateur."""
    payload = decode_email_confirm_token(data.token)
    if not payload:
        raise HTTPException(status_code=400, detail="Lien de confirmation invalide ou expiré")

    user_id = payload.get("sub")
    user = (await db.execute(select(Profile).where(Profile.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Compte introuvable")

    # ⭐ Marque l'email comme vérifié (la colonne existe maintenant en base)
    user.email_verified = True
    await db.commit()
    await db.refresh(user)

    # Connecte l'utilisateur (retourne token + cookie)
    return _auth_response(user, response)

@router.post("/login")
async def login(data: LoginInput, response: Response, db: AsyncSession = Depends(get_db)):
    email = data.email.lower().strip()
    result = await db.execute(select(Profile).where(Profile.email == email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="E-mail ou mot de passe incorrect")

    # ⭐ NOUVEAU : bloque la connexion si l'email n'est pas confirmé
    if not user.email_verified:
        raise HTTPException(
            status_code=403,
            detail="Votre compte n'est pas encore activé. Vérifiez votre boîte mail et cliquez sur le lien de confirmation."
        )

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


# ==================== Adresses ====================
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


# ==================== Password reset ====================
class ForgotInput(BaseModel):
    email: EmailStr
    lang: str = "fr"


class ResetInput(BaseModel):
    token: str
    password: str
    lang: str = "fr"


class ChangePasswordInput(BaseModel):
    current_password: str
    new_password: str


class EmailChangeRequestIn(BaseModel):
    password: str
    new_email: EmailStr


class PasswordCheckIn(BaseModel):
    password: str


class DeleteAccountInput(BaseModel):
    password: str
    confirm: str = ""


def _tpl_reset(user: Profile, link: str, lang: str):
    first = escape(user.first_name or "")
    if lang == "en":
        subject = "Reset your CAKESSHOP password"
        body = (f"<p>Hi {first},</p><p>We received a request to reset the password of your CAKESSHOP account. "
                f"This link is valid for 1 hour and can be used once.</p>"
                f'<p style="margin:22px 0"><a href="{link}" style="background:#C58B58;color:#fff;text-decoration:none;padding:12px 22px;font-weight:bold;text-transform:uppercase;display:inline-block">Choose a new password</a></p>'
                "<p style=\"color:#777;font-size:13px\">If you did not request this, you can ignore this email: your password stays unchanged.</p>")
        title = "Password reset"
    else:
        subject = "Réinitialisation de votre mot de passe CAKESSHOP"
        body = (f"<p>Bonjour {first},</p><p>Nous avons reçu une demande de réinitialisation du mot de passe de votre compte CAKESSHOP. "
                f"Ce lien est valable 1 heure et utilisable une seule fois.</p>"
                f'<p style="margin:22px 0"><a href="{link}" style="background:#C58B58;color:#fff;text-decoration:none;padding:12px 22px;font-weight:bold;text-transform:uppercase;display:inline-block">Choisir un nouveau mot de passe</a></p>'
                "<p style=\"color:#777;font-size:13px\">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : votre mot de passe reste inchangé.</p>")
        title = "Mot de passe oublié"
    return subject, _layout(title, body, lang)


@router.post("/forgot-password")
async def forgot_password(data: ForgotInput, db: AsyncSession = Depends(get_db)):
    email = data.email.lower().strip()
    user = (await db.execute(select(Profile).where(Profile.email == email))).scalar_one_or_none()
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


def _tpl_password_changed(user: Profile, lang: str):
    first = escape(user.first_name or "")
    if lang == "en":
        subject = "Your CAKESSHOP password has been changed"
        body = (f"<p>Hi {first},</p>"
                "<p>Your CAKESSHOP password has just been changed. You can now log in with your new password.</p>"
                "<p style='color:#a00;background:#fff3f3;padding:12px;border-left:3px solid #C58B58'>"
                "<strong>If you did not make this change</strong>, reset your password immediately and contact us at "
                "contact@actoos.com.</p>")
        title = "Password changed"
    else:
        subject = "Votre mot de passe CAKESSHOP a été modifié"
        body = (f"<p>Bonjour {first},</p>"
                "<p>Votre mot de passe CAKESSHOP vient d'être modifié. Vous pouvez dès maintenant vous connecter avec votre nouveau mot de passe.</p>"
                "<p style='color:#a00;background:#fff3f3;padding:12px;border-left:3px solid #C58B58'>"
                "<strong>Si vous n'êtes pas à l'origine de ce changement</strong>, réinitialisez votre mot de passe immédiatement "
                "et contactez-nous à contact@actoos.com.</p>")
        title = "Mot de passe modifié"
    return subject, _layout(title, body, lang)


@router.post("/reset-password")
async def reset_password(data: ResetInput, db: AsyncSession = Depends(get_db)):
    validate_password(data.password)
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

    lang = data.lang if data.lang in ("fr", "en") else "fr"
    try:
        subject, html = _tpl_password_changed(user, lang)
        await send_templated(db, to=user.email, subject=subject, html=html, template="password_changed")
    except Exception:
        pass

    return {"ok": True}


# ==================== Change password / Change email / Delete account ====================
@router.post("/check-password-strength")
async def check_password_strength(data: PasswordCheckIn):
    return password_strength(data.password)


@router.post("/change-password")
async def change_password(data: ChangePasswordInput, user: Profile = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")
    validate_password(data.new_password)
    if data.current_password == data.new_password:
        raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit etre different de l'ancien")

    user.password_hash = hash_password(data.new_password)
    await db.commit()

    try:
        lang = user.preferred_language if user.preferred_language in ("fr", "en") else "fr"
        subject, html = _tpl_password_changed(user, lang)
        await send_templated(db, to=user.email, subject=subject, html=html, template="password_changed")
    except Exception:
        pass

    return {"ok": True}


@router.post("/request-email-change")
async def request_email_change(data: EmailChangeRequestIn, user: Profile = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Mot de passe incorrect")
    new_email = str(data.new_email).lower().strip()
    old_email = user.email.lower()
    if new_email == old_email:
        raise HTTPException(status_code=400, detail="Cet email est deja le votre")
    existing = (await db.execute(select(Profile).where(Profile.email == new_email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Cet email est deja utilise par un autre compte")

    prev = (await db.execute(
        select(EmailChangeRequest).where(
            EmailChangeRequest.user_id == user.id,
            EmailChangeRequest.used_at.is_(None),
            EmailChangeRequest.cancelled_at.is_(None),
        )
    )).scalars().all()
    now = datetime.now(timezone.utc)
    for p in prev:
        p.cancelled_at = now

    raw_old = secrets.token_urlsafe(32)
    raw_new = secrets.token_urlsafe(32)
    ecr = EmailChangeRequest(
        user_id=user.id,
        old_email=old_email,
        new_email=new_email,
        old_token_hash=hashlib.sha256(raw_old.encode()).hexdigest(),
        new_token_hash=hashlib.sha256(raw_new.encode()).hexdigest(),
        expires_at=now + timedelta(hours=24),
    )
    db.add(ecr)
    await db.commit()
    await db.refresh(ecr)

    lang = user.preferred_language if user.preferred_language in ("fr", "en") else "fr"
    u_dict = user.to_dict()

    cancel_url = f"{PUBLIC_BASE_URL}/account?cancel_email_change=1"
    try:
        subject, html = tpl_email_change_old(u_dict, old_email, new_email, raw_old, cancel_url, lang)
        await send_templated(db, to=old_email, subject=subject, html=html, template="email_change_old")
    except Exception:
        pass

    try:
        subject, html = tpl_email_change_new(u_dict, old_email, new_email, raw_new, lang)
        await send_templated(db, to=new_email, subject=subject, html=html, template="email_change_new")
    except Exception:
        pass

    return {"ok": True, "request_id": ecr.id, "new_email": new_email, "expires_at": ecr.expires_at.isoformat()}


@router.get("/confirm-email-change/{token}")
async def confirm_email_change(token: str, type: str = "old", db: AsyncSession = Depends(get_db)):
    th = hashlib.sha256(token.encode()).hexdigest()
    now = datetime.now(timezone.utc)

    ecr = None
    if type == "old":
        ecr = (await db.execute(select(EmailChangeRequest).where(EmailChangeRequest.old_token_hash == th))).scalar_one_or_none()
    else:
        ecr = (await db.execute(select(EmailChangeRequest).where(EmailChangeRequest.new_token_hash == th))).scalar_one_or_none()

    if not ecr:
        ecr = (await db.execute(select(EmailChangeRequest).where(
            (EmailChangeRequest.old_token_hash == th) | (EmailChangeRequest.new_token_hash == th)
        ))).scalar_one_or_none()

    if not ecr:
        raise HTTPException(status_code=404, detail="Lien invalide")
    if ecr.used_at:
        return {"ok": True, "already": True, "message": "Changement deja effectue"}
    if ecr.cancelled_at:
        raise HTTPException(status_code=400, detail="Cette demande a ete annulee")
    if ecr.expires_at < now:
        raise HTTPException(status_code=400, detail="Lien expire")

    if ecr.old_token_hash == th:
        ecr.old_confirmed_at = now
    if ecr.new_token_hash == th:
        ecr.new_confirmed_at = now
    await db.commit()

    if ecr.old_confirmed_at and ecr.new_confirmed_at:
        user = (await db.execute(select(Profile).where(Profile.id == ecr.user_id))).scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="Utilisateur introuvable")
        existing = (await db.execute(select(Profile).where(Profile.email == ecr.new_email, Profile.id != user.id))).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=400, detail="Cet email est deja utilise")
        user.email = ecr.new_email
        ecr.used_at = now
        await db.commit()

        lang = user.preferred_language if user.preferred_language in ("fr", "en") else "fr"
        try:
            first = escape(user.first_name or "")
            if lang == "en":
                subject = "Your CAKESSHOP email has been updated"
                body = (f"<p>Hi {first},</p><p>Your CAKESSHOP account email has been successfully updated to "
                        f"<strong>{escape(ecr.new_email)}</strong>.</p>"
                        "<p style='color:#777;font-size:13px'>If you did not make this change, contact us immediately.</p>")
            else:
                subject = "Votre email CAKESSHOP a ete modifie"
                body = (f"<p>Bonjour {first},</p><p>L'email de votre compte CAKESSHOP a bien ete modifie vers "
                        f"<strong>{escape(ecr.new_email)}</strong>.</p>"
                        "<p style='color:#777;font-size:13px'>Si vous n'etes pas a l'origine de ce changement, contactez-nous immediatement.</p>")
            html = _layout("Email modifie" if lang == "fr" else "Email updated", body, lang)
            await send_templated(db, to=ecr.new_email, subject=subject, html=html, template="email_changed")
        except Exception:
            pass

        return {"ok": True, "completed": True, "new_email": ecr.new_email}

    return {
        "ok": True,
        "completed": False,
        "waiting_for_old": not bool(ecr.old_confirmed_at),
        "waiting_for_new": not bool(ecr.new_confirmed_at),
    }


@router.get("/pending-email-change")
async def pending_email_change(user: Profile = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    ecr = (await db.execute(
        select(EmailChangeRequest).where(
            EmailChangeRequest.user_id == user.id,
            EmailChangeRequest.used_at.is_(None),
            EmailChangeRequest.cancelled_at.is_(None),
            EmailChangeRequest.expires_at > now,
        ).order_by(EmailChangeRequest.created_at.desc())
    )).scalars().first()
    if not ecr:
        return {"pending": None}
    return {
        "pending": {
            "id": ecr.id,
            "old_email": ecr.old_email,
            "new_email": ecr.new_email,
            "old_confirmed": bool(ecr.old_confirmed_at),
            "new_confirmed": bool(ecr.new_confirmed_at),
            "expires_at": ecr.expires_at.isoformat(),
            "created_at": ecr.created_at.isoformat() if ecr.created_at else None,
        }
    }


@router.post("/cancel-email-change")
async def cancel_email_change(user: Profile = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    ecr = (await db.execute(
        select(EmailChangeRequest).where(
            EmailChangeRequest.user_id == user.id,
            EmailChangeRequest.used_at.is_(None),
            EmailChangeRequest.cancelled_at.is_(None),
        )
    )).scalars().first()
    if not ecr:
        return {"ok": True, "cancelled": False}
    ecr.cancelled_at = now
    await db.commit()
    return {"ok": True, "cancelled": True}


@router.delete("/me")
async def delete_my_account(data: DeleteAccountInput, user: Profile = Depends(get_current_user), response: Response = None, db: AsyncSession = Depends(get_db)):
    if not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Mot de passe incorrect")
    confirm = (data.confirm or "").strip().upper()
    if confirm not in ("SUPPRIMER", "DELETE"):
        raise HTTPException(status_code=400, detail="Tapez SUPPRIMER pour confirmer")

    try:
        sub = (await db.execute(select(NewsletterSubscriber).where(
            (NewsletterSubscriber.user_id == user.id) | (NewsletterSubscriber.email == user.email)
        ))).scalars().first()
        if sub:
            sub.active = False
            sub.unsubscribed_at = datetime.now(timezone.utc)
    except Exception:
        pass

    email_backup = user.email
    try:
        await db.delete(user)
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Erreur suppression: {str(e)[:100]}")

    try:
        from models import EmailLog
        db.add(EmailLog(to_email=email_backup, subject="Compte supprime par le client",
                        template="account_deleted", status="disabled"))
        await db.commit()
    except Exception:
        pass

    if response:
        response.delete_cookie("access_token", path="/")
    return {"ok": True}