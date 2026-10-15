import logging
from html import escape
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import ContactMessage
from auth import get_optional_user, get_current_admin
from emails import send_templated, _layout, ADMIN_NOTIFY_EMAIL

logger = logging.getLogger("strykos.contact")
router = APIRouter(tags=["contact"])


def tpl_contact_admin(msg: ContactMessage):
    """Notification envoyée à l'admin quand un nouveau message arrive."""
    subject = f"[CAKESSHOP] Nouveau message — {msg.subject[:80]}"
    body = (
        f"<p><strong>De :</strong> {escape(msg.name)} &lt;{escape(msg.email)}&gt;</p>"
        f"<p><strong>Sujet :</strong> {escape(msg.subject)}</p>"
        f"<p><strong>Langue :</strong> {escape(msg.lang)}</p>"
        f"<hr style='border:none;border-top:1px solid #eee;margin:16px 0'>"
        f"<p style='white-space:pre-line'>{escape(msg.message)}</p>"
        f"<hr style='border:none;border-top:1px solid #eee;margin:16px 0'>"
        f"<p style='font-size:12px;color:#888'>Reçu le {msg.created_at.strftime('%d/%m/%Y %H:%M')} UTC</p>"
    )
    return subject, _layout("Nouveau message de contact", body, "fr")


def tpl_contact_ack(msg: ContactMessage):
    """Accusé de réception envoyé au client."""
    lang = msg.lang if msg.lang in ("fr", "en") else "fr"
    if lang == "en":
        subject = "We received your message — CAKESSHOP"
        body = (
            f"<p>Hi {escape(msg.name)},</p>"
            "<p>Thanks for reaching out. We have received your message and will reply within 24-48 business hours.</p>"
            f"<p style='color:#666;font-size:13px;margin-top:20px'><strong>Your message:</strong><br>"
            f"<span style='white-space:pre-line'>{escape(msg.message)}</span></p>"
        )
        title = "Message received"
    else:
        subject = "Nous avons reçu votre message — CAKESSHOP"
        body = (
            f"<p>Bonjour {escape(msg.name)},</p>"
            "<p>Merci de nous avoir contactés. Nous avons bien reçu votre message et vous répondrons sous 24 à 48 heures ouvrées.</p>"
            f"<p style='color:#666;font-size:13px;margin-top:20px'><strong>Votre message :</strong><br>"
            f"<span style='white-space:pre-line'>{escape(msg.message)}</span></p>"
        )
        title = "Message reçu"
    return subject, _layout(title, body, lang)


# ---------------- Public ----------------
class ContactIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    subject: str = Field(..., min_length=2, max_length=200)
    message: str = Field(..., min_length=10, max_length=5000)
    lang: str = "fr"


@router.post("/contact")
async def submit_contact(
    data: ContactIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_optional_user),
):
    # Basic anti-spam: on garde l'IP + UA
    ip = request.client.host if request.client else None
    ua = (request.headers.get("user-agent") or "")[:255]

    msg = ContactMessage(
        name=data.name.strip(),
        email=str(data.email).lower().strip(),
        subject=data.subject.strip(),
        message=data.message.strip(),
        lang=data.lang if data.lang in ("fr", "en") else "fr",
        user_id=user.id if user else None,
        ip_address=ip,
        user_agent=ua,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    # Notif admin (ne bloque pas si échoue — send_templated ne raise jamais)
    if ADMIN_NOTIFY_EMAIL:
        subj, html = tpl_contact_admin(msg)
        await send_templated(db, to=ADMIN_NOTIFY_EMAIL, subject=subj, html=html, template="contact_admin_notify")

    # Ack client
    subj, html = tpl_contact_ack(msg)
    await send_templated(db, to=msg.email, subject=subj, html=html, template="contact_ack")

    return {"ok": True, "id": msg.id}


# ---------------- Admin ----------------
admin = APIRouter(prefix="/admin/contact-messages", dependencies=[Depends(get_current_admin)])


@admin.get("")
async def list_messages(
    q: Optional[str] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(ContactMessage).order_by(ContactMessage.created_at.desc()).limit(500)
    if q:
        like = f"%{q.strip()}%"
        query = query.where(or_(
            ContactMessage.name.ilike(like),
            ContactMessage.email.ilike(like),
            ContactMessage.subject.ilike(like),
        ))
    if status:
        query = query.where(ContactMessage.status == status)
    rows = (await db.execute(query)).scalars().all()
    counts = {}
    for st in ("new", "read", "replied", "archived"):
        counts[st] = (await db.execute(
            select(func.count(ContactMessage.id)).where(ContactMessage.status == st)
        )).scalar() or 0
    return {"counts": counts, "messages": [m.to_dict() for m in rows]}


@admin.get("/{msg_id}")
async def get_message(msg_id: str, db: AsyncSession = Depends(get_db)):
    msg = (await db.execute(select(ContactMessage).where(ContactMessage.id == msg_id))).scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message introuvable")
    if msg.status == "new":
        from datetime import datetime, timezone
        msg.status = "read"
        msg.read_at = datetime.now(timezone.utc)
        await db.commit()
    return msg.to_dict()


class ContactUpdate(BaseModel):
    status: Optional[str] = None


@admin.put("/{msg_id}")
async def update_message(msg_id: str, data: ContactUpdate, db: AsyncSession = Depends(get_db)):
    msg = (await db.execute(select(ContactMessage).where(ContactMessage.id == msg_id))).scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message introuvable")
    if data.status and data.status in ("new", "read", "replied", "archived"):
        from datetime import datetime, timezone
        msg.status = data.status
        if data.status == "read" and not msg.read_at:
            msg.read_at = datetime.now(timezone.utc)
        if data.status == "replied" and not msg.replied_at:
            msg.replied_at = datetime.now(timezone.utc)
    await db.commit()
    return msg.to_dict()


@admin.delete("/{msg_id}")
async def delete_message(msg_id: str, db: AsyncSession = Depends(get_db)):
    msg = (await db.execute(select(ContactMessage).where(ContactMessage.id == msg_id))).scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message introuvable")
    await db.delete(msg)
    await db.commit()
    return {"ok": True}


router.include_router(admin)