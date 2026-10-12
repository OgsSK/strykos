import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import Cart, Profile
from auth import get_current_user

logger = logging.getLogger("strykos.cart")
router = APIRouter(prefix="/cart", tags=["cart"])


class CartSyncIn(BaseModel):
    items: list = []
    subtotal_eur: float = 0


class OptOutIn(BaseModel):
    opt_out: bool = True


@router.get("")
async def get_my_cart(user: Profile = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Retourne le panier sauvegarde du user connecte (ou un panier vide)."""
    cart = (await db.execute(select(Cart).where(Cart.user_id == user.id))).scalar_one_or_none()
    if not cart:
        return {"cart": None, "reminder_opt_out": False}
    if cart.recovered_order_id:
        return {"cart": None, "reminder_opt_out": bool(cart.reminder_opt_out)}
    d = cart.to_dict()
    return {"cart": d, "reminder_opt_out": bool(cart.reminder_opt_out)}


@router.post("/sync")
async def sync_cart(data: CartSyncIn, user: Profile = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Sauvegarde le panier du user. Appele par le frontend a chaque modification (avec debounce)."""
    cart = (await db.execute(select(Cart).where(Cart.user_id == user.id))).scalar_one_or_none()

    if not cart:
        cart = Cart(user_id=user.id, items=data.items, subtotal_eur=data.subtotal_eur)
        db.add(cart)
    else:
        cart.items = data.items
        cart.subtotal_eur = data.subtotal_eur
        # Si le client remodifie son panier apres une commande, on considere
        # que c'est un nouveau panier : reset des compteurs de relance
        if cart.recovered_order_id:
            cart.recovered_order_id = None
            cart.email_1_sent_at = None
            cart.email_2_sent_at = None
    await db.commit()
    return {"ok": True}


@router.post("/opt-out")
async def opt_out_reminders(data: OptOutIn, user: Profile = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Active/desactive les emails de relance panier pour ce user."""
    cart = (await db.execute(select(Cart).where(Cart.user_id == user.id))).scalar_one_or_none()
    if not cart:
        return {"ok": True, "opt_out": data.opt_out}
    cart.reminder_opt_out = data.opt_out
    await db.commit()
    return {"ok": True, "opt_out": cart.reminder_opt_out}