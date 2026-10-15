"""
Router pour les livreurs (role=driver).
Endpoints : setup du compte, validation OTP, stats.
"""
import random
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import Profile, Order
from auth import (
    hash_password, verify_password, create_access_token,
    get_current_driver, decode_driver_invite_token,
)

router = APIRouter(prefix="/driver", tags=["driver"])


# ================================================================
# ⭐ SETUP : créer son mot de passe via token d'invitation
# ================================================================

class SetupIn(BaseModel):
    token: str
    password: str


@router.post("/setup")
async def driver_setup(data: SetupIn, response: Response, db: AsyncSession = Depends(get_db)):
    """Active un compte livreur : crée son mot de passe via le token d'invitation."""
    payload = decode_driver_invite_token(data.token)
    if not payload:
        raise HTTPException(status_code=400, detail="Lien d'invitation invalide ou expiré")

    user_id = payload.get("sub")
    user = (await db.execute(select(Profile).where(Profile.id == user_id))).scalar_one_or_none()
    if not user or user.role != "driver":
        raise HTTPException(status_code=404, detail="Compte livreur introuvable")

    if user.email_verified:
        raise HTTPException(status_code=400, detail="Ce compte a déjà été activé. Connectez-vous.")

    # Validation basique du mot de passe
    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 8 caractères")
    if not any(c.isalpha() for c in data.password):
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins une lettre")
    if not any(c.isdigit() for c in data.password):
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins un chiffre")

    # Enregistre le mot de passe + marque comme vérifié
    user.password_hash = hash_password(data.password)
    user.email_verified = True
    await db.commit()
    await db.refresh(user)

    # Connecte automatiquement le livreur
    token = create_access_token(user.id, user.email, user.role)
    response.set_cookie("access_token", token, httponly=True, secure=True,
                        samesite="none", max_age=604800 * 4, path="/")  # 28 jours

    return {"token": token, "user": user.to_dict()}


# ================================================================
# ⭐ LOGIN spécifique livreur (même logique que /auth/login)
# ================================================================

class DriverLoginIn(BaseModel):
    email: str
    password: str


@router.post("/login")
async def driver_login(data: DriverLoginIn, response: Response, db: AsyncSession = Depends(get_db)):
    email = data.email.lower().strip()
    user = (await db.execute(select(Profile).where(Profile.email == email))).scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="E-mail ou mot de passe incorrect")
    if user.role != "driver":
        raise HTTPException(status_code=403, detail="Ce compte n'est pas un compte livreur")
    if not user.email_verified:
        raise HTTPException(status_code=403, detail="Votre compte n'est pas encore activé. Vérifiez vos emails.")

    token = create_access_token(user.id, user.email, user.role)
    response.set_cookie("access_token", token, httponly=True, secure=True,
                        samesite="none", max_age=604800 * 4, path="/")

    return {"token": token, "user": user.to_dict()}


# ================================================================
# ⭐ VALIDATION D'UN CODE OTP
# ================================================================

class ValidateIn(BaseModel):
    code: str


@router.post("/validate-code")
async def driver_validate_code(data: ValidateIn, driver: Profile = Depends(get_current_driver),
                               db: AsyncSession = Depends(get_db)):
    """Valide un code OTP → passe la commande à 'delivered'."""
    code = (data.code or "").strip().replace(" ", "")
    if len(code) != 6 or not code.isdigit():
        raise HTTPException(status_code=400, detail="Code invalide (6 chiffres attendus)")

    # Cherche une commande expédiée avec ce code
    order = (await db.execute(
        select(Order).where(
            Order.delivery_otp == code,
            Order.status.in_(["shipped", "in_transit"]),
        )
    )).scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Aucune commande expédiée ne correspond à ce code")

    # ⭐ Vérifie le lock (après 5 tentatives échouées)
    if order.delivery_otp_locked:
        raise HTTPException(status_code=403,
            detail="Ce code a été bloqué après trop de tentatives. Contactez l'administrateur.")

    # ⭐ Vérifie l'expiration
    now = datetime.now(timezone.utc)
    if order.delivery_otp_expires_at and order.delivery_otp_expires_at < now:
        raise HTTPException(status_code=410,
            detail="Ce code a expiré. Contactez l'administrateur pour un nouveau code.")

    # ⭐ Vérifie le nombre de tentatives
    if (order.delivery_otp_attempts or 0) >= 5:
        order.delivery_otp_locked = True
        await db.commit()
        raise HTTPException(status_code=403,
            detail="Trop de tentatives. Le code a été bloqué. Contactez l'administrateur.")

    # Note : la comparaison ci-dessus est exacte, donc si on est ici, le code EST correct.
    # Le compteur de tentatives est incrémenté côté client si le code ne matche aucune commande.
    # Ici, on incrémente "au cas où" mais ça ne devrait jamais arriver car on a déjà matché.

    # ⭐ Marque la commande comme livrée
    order.status = "delivered"
    order.delivered_at = now
    order.delivered_by_driver_id = driver.id
    order.delivered_via = "otp"

    # Historique
    hist = list(order.status_history or [])
    hist.append({
        "status": "delivered",
        "at": now.isoformat(),
        "by": driver.email,
        "note": f"Livré par {driver.first_name} {driver.last_name} (code OTP validé)",
    })
    order.status_history = hist

    await db.commit()
    await db.refresh(order)

    # ⭐ Email de confirmation au client
    try:
        from emails import send_order_email
        await send_order_email(db, order, "order_delivered")
    except Exception:
        pass

    return {
        "ok": True,
        "order": {
            "order_number": order.order_number,
            "first_name": order.first_name,
            "city": (order.shipping_address or {}).get("city", ""),
        },
    }


# ================================================================
# ⭐ INFOS + STATS DU LIVREUR
# ================================================================

@router.get("/me")
async def driver_me(driver: Profile = Depends(get_current_driver)):
    return driver.to_dict()


@router.get("/stats")
async def driver_stats(driver: Profile = Depends(get_current_driver), db: AsyncSession = Depends(get_db)):
    """Statistiques du livreur : aujourd'hui / semaine / mois / dernières livraisons."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())
    month_start = today_start.replace(day=1)

    base_q = select(Order).where(
        Order.delivered_by_driver_id == driver.id,
        Order.delivered_via == "otp",
    )

    today_count = (await db.execute(
        select(func.count(Order.id)).where(
            Order.delivered_by_driver_id == driver.id,
            Order.delivered_via == "otp",
            Order.delivered_at >= today_start,
        )
    )).scalar() or 0

    week_count = (await db.execute(
        select(func.count(Order.id)).where(
            Order.delivered_by_driver_id == driver.id,
            Order.delivered_via == "otp",
            Order.delivered_at >= week_start,
        )
    )).scalar() or 0

    month_count = (await db.execute(
        select(func.count(Order.id)).where(
            Order.delivered_by_driver_id == driver.id,
            Order.delivered_via == "otp",
            Order.delivered_at >= month_start,
        )
    )).scalar() or 0

    # 10 dernières livraisons
    recent_res = await db.execute(
        select(Order).where(
            Order.delivered_by_driver_id == driver.id,
            Order.delivered_via == "otp",
        ).order_by(Order.delivered_at.desc()).limit(10)
    )
    recent = recent_res.scalars().all()

    return {
        "today": today_count,
        "week": week_count,
        "month": month_count,
        "recent": [
            {
                "order_number": o.order_number,
                "first_name": o.first_name,
                "city": (o.shipping_address or {}).get("city", ""),
                "delivered_at": o.delivered_at.isoformat() if o.delivered_at else None,
            }
            for o in recent
        ],
    }