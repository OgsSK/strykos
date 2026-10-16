"""
Router pour les livreurs (role=driver).
Endpoints : setup du compte, validation OTP, stats, historique, profil, confirmation COD.
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
from routers.commerce_router import push_history

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
    """Valide un code OTP → passe la commande à 'delivered'.
    Si la commande est en COD, retourne requires_payment_confirmation=True."""
    code = (data.code or "").strip().replace(" ", "")
    if len(code) != 6 or not code.isdigit():
        raise HTTPException(status_code=400, detail="Code invalide (6 chiffres attendus)")

    order = (await db.execute(
        select(Order).where(
            Order.delivery_otp == code,
            Order.status.in_(["shipped", "in_transit"]),
        )
    )).scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Aucune commande expédiée ne correspond à ce code")

    if order.delivery_otp_locked:
        raise HTTPException(status_code=403,
            detail="Ce code a été bloqué après trop de tentatives. Contactez l'administrateur.")

    now = datetime.now(timezone.utc)
    if order.delivery_otp_expires_at and order.delivery_otp_expires_at < now:
        raise HTTPException(status_code=410,
            detail="Ce code a expiré. Contactez l'administrateur pour un nouveau code.")

    # ⭐ CAS COD : on demande au livreur de confirmer qu'il a reçu le paiement
    if order.payment_method == "cod" and order.payment_status != "paid":
        return {
            "ok": True,
            "requires_payment_confirmation": True,
            "order": {
                "order_number": order.order_number,
                "first_name": order.first_name,
                "city": (order.shipping_address or {}).get("city", ""),
                "total": float(order.total or 0),
                "currency": order.currency,
            },
            "message": "Confirmez avoir reçu le paiement avant de clôturer la livraison.",
        }

    # ⭐ CAS normal (Stripe déjà payé, ou COD déjà payé)
    order.status = "delivered"
    order.delivered_at = now
    order.delivered_by_driver_id = driver.id
    order.delivered_via = "otp"

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

    try:
        from emails import send_order_email
        await send_order_email(db, order, "order_delivered")
    except Exception:
        pass

    return {
        "ok": True,
        "requires_payment_confirmation": False,
        "order": {
            "order_number": order.order_number,
            "first_name": order.first_name,
            "city": (order.shipping_address or {}).get("city", ""),
        },
    }


# ================================================================
# ⭐ CONFIRMATION DU PAIEMENT COD (par le livreur)
# ================================================================

class ConfirmCodIn(BaseModel):
    code: str
    payment_received: bool
    note: str = ""


@router.post("/confirm-cod-payment")
async def driver_confirm_cod(
    data: ConfirmCodIn,
    driver: Profile = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    """Le livreur confirme (ou non) avoir reçu le paiement COD."""
    code = (data.code or "").strip().replace(" ", "")
    if len(code) != 6 or not code.isdigit():
        raise HTTPException(status_code=400, detail="Code invalide")

    order = (await db.execute(
        select(Order).where(
            Order.delivery_otp == code,
            Order.status.in_(["shipped", "in_transit"]),
            Order.payment_method == "cod",
        )
    )).scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Commande COD expédiée introuvable")

    now = datetime.now(timezone.utc)

    if data.payment_received:
        # ✅ Le client a payé
        order.payment_status = "paid"
        order.cod_collected_at = now
        order.cod_collected_by_id = driver.id
        order.status = "delivered"
        order.delivered_at = now
        order.delivered_by_driver_id = driver.id
        order.delivered_via = "otp"

        push_history(order, "delivered", by=driver.email,
                     note=f"Livré par {driver.first_name} {driver.last_name} — paiement COD reçu ({order.total:.0f} {order.currency})")
        await db.commit()
        await db.refresh(order)

        try:
            from emails import send_order_email
            await send_order_email(db, order, "order_delivered")
        except Exception:
            pass

        return {"ok": True, "status": "delivered", "payment_status": "paid"}
    else:
        # ❌ Le client n'a pas payé / a refusé
        note = (data.note or "").strip()[:200]
        push_history(order, order.status, by=driver.email,
                     note=f"⚠️ Client n'a pas payé — livraison non finalisée{(' : ' + note) if note else ''}")
        await db.commit()

        # Notifie l'admin par email
        try:
            from emails import send_templated, ADMIN_NOTIFY_EMAIL, _layout, escape
            if ADMIN_NOTIFY_EMAIL:
                subject = f"[CAKESSHOP] ⚠️ COD non payé — {order.order_number}"
                body = (
                    f"<p><strong>Commande :</strong> {escape(order.order_number)}</p>"
                    f"<p><strong>Livreur :</strong> {escape(driver.first_name)} {escape(driver.last_name)} ({escape(driver.email)})</p>"
                    f"<p><strong>Client :</strong> {escape(order.first_name)} {escape(order.last_name)} — {escape(order.phone)}</p>"
                    f"<p><strong>Montant attendu :</strong> {order.total:.0f} {escape(order.currency)}</p>"
                    + (f"<p><strong>Note du livreur :</strong> {escape(note)}</p>" if note else "")
                    + f"<p>La commande reste en statut <strong>{escape(order.status)}</strong>. Contactez le client pour résoudre.</p>"
                )
                await send_templated(db, to=ADMIN_NOTIFY_EMAIL, subject=subject,
                                     html=_layout("COD non payé", body, "fr"),
                                     template="cod_not_paid", order_id=order.id)
        except Exception:
            pass

        return {"ok": True, "status": order.status, "payment_status": "pending"}


# ================================================================
# ⭐ INFOS + STATS DU LIVREUR
# ================================================================

@router.get("/me")
async def driver_me(driver: Profile = Depends(get_current_driver)):
    return driver.to_dict()


@router.get("/stats")
async def driver_stats(driver: Profile = Depends(get_current_driver), db: AsyncSession = Depends(get_db)):
    """Stats complètes du livreur."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())
    month_start = today_start.replace(day=1)

    async def count_since(since):
        return (await db.execute(
            select(func.count(Order.id)).where(
                Order.delivered_by_driver_id == driver.id,
                Order.delivered_via == "otp",
                Order.delivered_at >= since,
            )
        )).scalar() or 0

    today_count = await count_since(today_start)
    week_count = await count_since(week_start)
    month_count = await count_since(month_start)

    # Total toutes périodes confondues
    total_count = (await db.execute(
        select(func.count(Order.id)).where(
            Order.delivered_by_driver_id == driver.id,
            Order.delivered_via == "otp",
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
        "total": total_count,
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


# ================================================================
# ⭐ HISTORIQUE COMPLET DES LIVRAISONS
# ================================================================

@router.get("/history")
async def driver_history(
    period: str = "all",  # today | week | month | all
    page: int = 1,
    per_page: int = 20,
    driver: Profile = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    """Historique complet des livraisons du livreur, avec pagination."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    q = select(Order).where(
        Order.delivered_by_driver_id == driver.id,
        Order.delivered_via == "otp",
    )

    if period == "today":
        q = q.where(Order.delivered_at >= today_start)
    elif period == "week":
        week_start = today_start - timedelta(days=today_start.weekday())
        q = q.where(Order.delivered_at >= week_start)
    elif period == "month":
        month_start = today_start.replace(day=1)
        q = q.where(Order.delivered_at >= month_start)

    # Compte total pour la pagination
    total_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(total_q)).scalar() or 0

    # Pagination
    offset = (max(1, page) - 1) * per_page
    q = q.order_by(Order.delivered_at.desc()).offset(offset).limit(per_page)
    res = await db.execute(q)
    orders = res.scalars().all()

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, (total + per_page - 1) // per_page),
        "orders": [
            {
                "order_number": o.order_number,
                "first_name": o.first_name,
                "last_name": o.last_name,
                "city": (o.shipping_address or {}).get("city", ""),
                "country": (o.shipping_address or {}).get("country", ""),
                "delivered_at": o.delivered_at.isoformat() if o.delivered_at else None,
                "items_count": len(o.items or []),
            }
            for o in orders
        ],
    }


# ================================================================
# ⭐ MISE À JOUR DU PROFIL LIVREUR
# ================================================================

class UpdateProfileIn(BaseModel):
    first_name: str = ""
    last_name: str = ""
    phone: str = ""


@router.put("/profile")
async def driver_update_profile(
    data: UpdateProfileIn,
    driver: Profile = Depends(get_current_driver),
    db: AsyncSession = Depends(get_db),
):
    """Permet au livreur de modifier ses infos de contact (nom, téléphone)."""
    if data.first_name:
        driver.first_name = data.first_name.strip()
    if data.last_name:
        driver.last_name = data.last_name.strip()
    if data.phone is not None:
        driver.phone = data.phone.strip()
    await db.commit()
    await db.refresh(driver)
    return driver.to_dict()