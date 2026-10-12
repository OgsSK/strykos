import os
import asyncio
import re
import ipaddress
import logging
import httpx
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from models import EmailLog

logger = logging.getLogger("strykos.emails")

RESEND_API_URL = "https://api.resend.com/emails"
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "STRYKOS")
EMAIL_FROM_EMAIL = os.environ.get("EMAIL_FROM_EMAIL", "noreply@actoos.com")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO", "contact@actoos.com")
ADMIN_NOTIFY_EMAIL = os.environ.get("ADMIN_NOTIFY_EMAIL", "")
PUBLIC_BASE_URL = (os.environ.get("PUBLIC_BASE_URL") or os.environ.get("FRONTEND_URL", "")).rstrip("/")

# Contexte global pour le rendu des templates (thread-safe car asyncio single-thread)
_current_brand: dict | None = None


def emails_enabled() -> bool:
    return os.environ.get("EMAILS_ENABLED", "false").lower() == "true" and bool(RESEND_API_KEY)


# ---------------- Guardrail gate (G2 + G3) ----------------
_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
                # En dev, on tolère http://localhost pour tester les emails
        is_local_dev = low.startswith(("http://localhost", "http://127.0.0.1"))
        if not low.startswith("https://") and not is_local_dev:
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not is_local_dev and (not _host_ok(host) or urlparse(low).username is not None):
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def _send(to: str, subject: str, html: str) -> str | None:
    _assert_safe_email(subject, html)
    if not RESEND_API_KEY:
        raise RuntimeError("RESEND_API_KEY not configured")
    payload = {
        "from": f"{EMAIL_FROM_NAME} <{EMAIL_FROM_EMAIL}>",
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if EMAIL_REPLY_TO:
        payload["reply_to"] = EMAIL_REPLY_TO
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            RESEND_API_URL,
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
    if resp.status_code >= 400:
        try:
            body = resp.json()
        except ValueError:
            body = {}
        raise RuntimeError(f"{resp.status_code} {body.get('name', '')} {body.get('message', resp.text[:200])}")
    return resp.json().get("id")


async def send_templated(db, *, to: str, subject: str, html: str, template: str, order_id: str | None = None):
    """Send + persist an EmailLog row. Never raises (emails must not break commerce flows)."""
    global _current_brand
    # Charge la brand AVANT le rendu (pour que _layout la lise dans les appels suivants)
    try:
        _current_brand = await _get_brand(db)
    except Exception:
        _current_brand = None

    # Substitution dynamique des occurrences en dur dans le HTML déjà construit
    try:
        _brand = _current_brand or {"part1": "STRY", "part2": "KOS", "full": "STRYKOS"}
        # 1. Remplace STRYKOS par le nom courant (sujet + html)
        subject = _apply_brand(subject, _brand)
        html = _apply_brand(html, _brand)
        # 2. Remplace le logo "STRY<span...>KOS</span>" par la nouvelle version
        old_logo = 'STRY<span style="color:#e4002b">KOS</span>'
        new_logo = f'{escape(_brand["part1"])}<span style="color:#e4002b">{escape(_brand["part2"])}</span>'
        html = html.replace(old_logo, new_logo)
    except Exception:
        pass
    log = EmailLog(to_email=to, subject=subject, template=template, order_id=order_id)
    if not emails_enabled():
        log.status = "disabled"
    else:
        try:
            try:
                log.provider_id = (await _send(to, subject, html)) or ""
            except RuntimeError as e:
                if "429" not in str(e):
                    raise
                await asyncio.sleep(3)
                log.provider_id = (await _send(to, subject, html)) or ""
            log.status = "sent"
        except Exception as e:
            log.status = "failed"
            log.error = str(e)[:1000]
            logger.warning(f"Email failed [{template}] to {to}: {e}")
    db.add(log)
    try:
        await db.commit()
    except Exception as e:
        logger.warning(f"Email log commit failed: {e}")
    return log


# ---------------- Templates (FR / EN) ----------------
def _money(v, cur):
    if v is None:
        return ""
    if cur == "XOF":
        return f"{int(round(v)):,} FCFA".replace(",", " ")
    if cur == "USD":
        return f"${v:,.2f}"
    return f"{v:,.2f} €"


async def _get_brand(db) -> dict:
    """Lit le nom de la marque depuis settings.site (avec fallbacks)."""
    try:
        from models import Setting
        from sqlalchemy import select
        res = await db.execute(select(Setting).where(Setting.key == "site"))
        row = res.scalar_one_or_none()
        s = (row.value or {}) if row else {}
        part1 = s.get("brand_part1") or "STRY"
        part2 = s.get("brand_part2") or "KOS"
        return {
            "part1": part1,
            "part2": part2,
            "full": s.get("name") or f"{part1}{part2}",
        }
    except Exception:
        return {"part1": "STRY", "part2": "KOS", "full": "STRYKOS"}


def _apply_brand(text: str, brand: dict) -> str:
    """Remplace toutes les occurrences de STRYKOS par le nom actuel."""
    if not text or not isinstance(text, str):
        return text or ""
    return text.replace("STRYKOS", brand["full"])


def _layout(title: str, body_html: str, lang: str, brand: dict | None = None) -> str:
    # Priorite : parametre explicite > contexte global > fallback
    b = brand or _current_brand or {"part1": "STRY", "part2": "KOS", "full": "STRYKOS"}
    footer = (f"Envoyé par {b['full']}, boutique football indépendante. Nous ne demandons jamais votre mot de passe ni vos données bancaires par e-mail."
              if lang == "fr" else
              f"Sent by {b['full']}, independent football store. We never ask for your password or card details by email.")
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:24px 0;font-family:Arial,Helvetica,sans-serif">'
        '<tr><td align="center">'
        '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff">'
        f'<tr><td style="background:#0b0b0d;padding:22px 28px;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:1px">{escape(b["part1"])}<span style="color:#e4002b">{escape(b["part2"])}</span></td></tr>'
        f'<tr><td style="padding:28px;color:#141416;font-size:15px;line-height:1.55">'
        f'<h1 style="margin:0 0 16px;font-size:22px;text-transform:uppercase;letter-spacing:.5px">{escape(title)}</h1>'
        f'{body_html}'
        '</td></tr>'
        f'<tr><td style="padding:18px 28px;background:#f4f4f2;color:#777;font-size:12px;line-height:1.5">{footer}'
        + (f'<br>Contact : <a href="mailto:{escape(EMAIL_REPLY_TO)}" style="color:#777">{escape(EMAIL_REPLY_TO)}</a>' if EMAIL_REPLY_TO else '')
        + '</td></tr></table></td></tr></table>'
    )


def _items_table(order: dict, lang: str) -> str:
    cur = order["currency"]
    rows = ""
    for it in order.get("items") or []:
        name = it.get("name_fr" if lang == "fr" else "name_en") or ""
        size = f' ({escape(it.get("size") or "")})' if it.get("size") else ""
        custom = it.get("customization") or {}
        cust = f'<br><span style="color:#e4002b;font-size:12px">{escape(str(custom.get("name", "")))} {escape(str(custom.get("number", "")))}</span>' if custom else ""
        rows += (f'<tr><td style="padding:8px 0;border-bottom:1px solid #eee">{escape(name)}{size} × {it.get("quantity", 1)}{cust}</td>'
                 f'<td align="right" style="padding:8px 0;border-bottom:1px solid #eee;white-space:nowrap">{_money(it.get("line_total"), cur)}</td></tr>')
    lbl = {"fr": ("Sous-total", "Livraison", "Remise", "Total"), "en": ("Subtotal", "Shipping", "Discount", "Total")}[lang if lang in ("fr", "en") else "fr"]
    rows += f'<tr><td style="padding:8px 0;color:#777">{lbl[0]}</td><td align="right" style="padding:8px 0">{_money(order.get("subtotal"), cur)}</td></tr>'
    rows += f'<tr><td style="padding:4px 0;color:#777">{lbl[1]}</td><td align="right" style="padding:4px 0">{_money(order.get("shipping_cost"), cur)}</td></tr>'
    if order.get("discount"):
        rows += f'<tr><td style="padding:4px 0;color:#777">{lbl[2]} ({escape(order.get("promo_code") or "")})</td><td align="right" style="padding:4px 0;color:#1a7f37">-{_money(order.get("discount"), cur)}</td></tr>'
    rows += f'<tr><td style="padding:10px 0;font-weight:bold;font-size:17px">{lbl[3]}</td><td align="right" style="padding:10px 0;font-weight:bold;font-size:17px">{_money(order.get("total"), cur)}</td></tr>'
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">{rows}</table>'


def _track_button(order: dict, lang: str) -> str:
    if not PUBLIC_BASE_URL.startswith("https://"):
        return ""
    url = f"{PUBLIC_BASE_URL}/suivi?order={escape(order['order_number'])}&email={escape(order.get('email') or '')}"
    label = "Suivre ma commande" if lang == "fr" else "Track my order"
    return (f'<p style="margin:22px 0"><a href="{url}" style="background:#e4002b;color:#fff;text-decoration:none;'
            f'padding:12px 22px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;display:inline-block">{label}</a></p>')


def _address_block(order: dict, lang: str) -> str:
    a = order.get("shipping_address") or {}
    title = "Adresse de livraison" if lang == "fr" else "Shipping address"
    m = order.get("shipping_method") or {}
    method = m.get("name_fr" if lang == "fr" else "name_en", "")
    delay = m.get("delay_fr" if lang == "fr" else "delay_en", "")
    return (f'<p style="margin:14px 0 0;font-weight:bold">{title}</p>'
            f'<p style="margin:4px 0;color:#444">{escape(a.get("first_name", ""))} {escape(a.get("last_name", ""))}<br>'
            f'{escape(a.get("address_line", ""))}<br>{escape(a.get("postal_code", ""))} {escape(a.get("city", ""))}, {escape(a.get("country", ""))}</p>'
            + (f'<p style="margin:4px 0;color:#444">{escape(method)} — {escape(delay)}</p>' if method else ""))


def tpl_order_confirmed(order: dict, lang: str):
    n = escape(order["order_number"])
    first = escape(order.get("first_name") or "")
    if lang == "en":
        subject = f"Your STRYKOS order {n} is confirmed"
        body = (f"<p>Hi {first},</p><p>Thank you! Your payment has been received and your order <strong>{n}</strong> is confirmed. "
                "We are preparing it now and will email you again once it ships.</p>")
        title = "Order confirmed"
    else:
        subject = f"Votre commande STRYKOS {n} est confirmée"
        body = (f"<p>Bonjour {first},</p><p>Merci ! Votre paiement a bien été reçu et votre commande <strong>{n}</strong> est confirmée. "
                "Nous la préparons dès maintenant et vous préviendrons par e-mail dès son expédition.</p>")
        title = "Commande confirmée"
    if order.get("payment_notice"):
        body += f'<p style="font-size:13px;color:#8a6d00;background:#fff8e1;padding:10px">{escape(order["payment_notice"])}</p>'
    body += _items_table(order, lang) + _address_block(order, lang) + _track_button(order, lang)
    return subject, _layout(title, body, lang)


def tpl_order_shipped(order: dict, lang: str):
    n = escape(order["order_number"])
    first = escape(order.get("first_name") or "")
    carrier = escape(order.get("tracking_carrier") or "")
    num = escape(order.get("tracking_number") or "")
    url = (order.get("tracking_url") or "").strip()
    link = ""
    if url.lower().startswith("https://"):
        lbl = "Suivre le colis chez le transporteur" if lang == "fr" else "Track the parcel with the carrier"
        link = f'<p><a href="{escape(url)}" style="color:#e4002b;font-weight:bold">{lbl}</a></p>'
    if lang == "en":
        subject = f"Your STRYKOS order {n} has shipped"
        body = (f"<p>Hi {first},</p><p>Good news — your order <strong>{n}</strong> is on its way.</p>"
                + (f"<p>Carrier: <strong>{carrier}</strong><br>Tracking number: <strong>{num}</strong></p>" if num else ""))
        title = "Order shipped"
    else:
        subject = f"Votre commande STRYKOS {n} a été expédiée"
        body = (f"<p>Bonjour {first},</p><p>Bonne nouvelle — votre commande <strong>{n}</strong> est en route.</p>"
                + (f"<p>Transporteur : <strong>{carrier}</strong><br>Numéro de suivi : <strong>{num}</strong></p>" if num else ""))
        title = "Commande expédiée"
    body += link + _address_block(order, lang) + _track_button(order, lang)
    return subject, _layout(title, body, lang)


def tpl_order_delivered(order: dict, lang: str):
    n = escape(order["order_number"])
    first = escape(order.get("first_name") or "")
    if lang == "en":
        subject = f"Your STRYKOS order {n} has been delivered"
        body = (f"<p>Hi {first},</p><p>Your order <strong>{n}</strong> has been delivered. We hope you love your gear! "
                "If anything is wrong, reply to this email within 14 days.</p>")
        title = "Order delivered"
    else:
        subject = f"Votre commande STRYKOS {n} a été livrée"
        body = (f"<p>Bonjour {first},</p><p>Votre commande <strong>{n}</strong> a été livrée. Nous espérons que votre équipement vous plaît ! "
                "En cas de problème, répondez à cet e-mail sous 14 jours.</p>")
        title = "Commande livrée"
    body += _track_button(order, lang)
    return subject, _layout(title, body, lang)


def tpl_order_cancelled(order: dict, lang: str, refunded: bool):
    n = escape(order["order_number"])
    first = escape(order.get("first_name") or "")
    if lang == "en":
        subject = f"Your STRYKOS order {n} has been {'refunded' if refunded else 'cancelled'}"
        body = f"<p>Hi {first},</p><p>Your order <strong>{n}</strong> has been cancelled."
        body += " The refund has been issued to your original payment method (allow 5-10 business days).</p>" if refunded else "</p>"
        title = "Order refunded" if refunded else "Order cancelled"
    else:
        subject = f"Votre commande STRYKOS {n} a été {'remboursée' if refunded else 'annulée'}"
        body = f"<p>Bonjour {first},</p><p>Votre commande <strong>{n}</strong> a été annulée."
        body += " Le remboursement a été émis sur votre moyen de paiement initial (délai 5 à 10 jours ouvrés).</p>" if refunded else "</p>"
        title = "Commande remboursée" if refunded else "Commande annulée"
    body += _items_table(order, lang)
    return subject, _layout(title, body, lang)

def tpl_order_refunded(order: dict, lang: str):
    n = escape(order["order_number"])
    first = escape(order.get("first_name") or "")
    if lang == "en":
        subject = f"Your STRYKOS order {n} has been refunded"
        body = (f"<p>Hi {first},</p><p>We've issued a refund for your order <strong>{n}</strong>. "
                "The amount will be credited back to your original payment method within 5 to 10 business days, "
                "depending on your bank.</p>"
                "<p>If you have any question, just reply to this email.</p>")
        title = "Order refunded"
    else:
        subject = f"Votre commande STRYKOS {n} a été remboursée"
        body = (f"<p>Bonjour {first},</p><p>Nous avons émis un remboursement pour votre commande <strong>{n}</strong>. "
                "Le montant sera recrédité sur votre moyen de paiement initial sous 5 à 10 jours ouvrés, "
                "selon votre banque.</p>"
                "<p>Pour toute question, répondez simplement à cet e-mail.</p>")
        title = "Commande remboursée"
    body += _items_table(order, lang)
    return subject, _layout(title, body, lang)


def tpl_cancellation_requested(order: dict, lang: str):
    """Accuse de reception envoye au CLIENT quand il demande l'annulation."""
    n = escape(order["order_number"])
    first = escape(order.get("first_name") or "")
    if lang == "en":
        subject = f"We received your cancellation request for order {n}"
        body = (f"<p>Hi {first},</p>"
                f"<p>We've received your cancellation request for order <strong>{n}</strong>. "
                "Our team will review it within 24-48 business hours.</p>"
                "<p>If approved, a full refund will be issued to your original payment method.</p>"
                "<p>You'll receive a confirmation email as soon as a decision is made.</p>")
        title = "Cancellation request received"
    else:
        subject = f"Votre demande d'annulation pour la commande {n}"
        body = (f"<p>Bonjour {first},</p>"
                f"<p>Nous avons bien recu votre demande d'annulation pour la commande <strong>{n}</strong>. "
                "Notre equipe va l'examiner sous 24 a 48 heures ouvrees.</p>"
                "<p>Si elle est acceptee, un remboursement integral sera effectue sur votre moyen de paiement initial.</p>"
                "<p>Vous recevrez un e-mail de confirmation des qu'une decision sera prise.</p>")
        title = "Demande d'annulation recue"
    body += _items_table(order, lang)
    return subject, _layout(title, body, lang)


def tpl_cancellation_admin_notify(order: dict):
    """Notification envoyee a l'ADMIN quand un client demande l'annulation."""
    n = escape(order["order_number"])
    reason = escape(order.get("cancellation_reason") or "(non precisee)")
    subject = f"[STRYKOS] Demande d'annulation — {n}"
    body = (f"<p>Le client <strong>{escape(order.get('first_name') or '')} {escape(order.get('last_name') or '')}</strong> "
            f"({escape(order.get('email') or '')}) demande l'annulation de la commande <strong>{n}</strong>.</p>"
            f"<p><strong>Raison :</strong> {reason}</p>"
            + _items_table(order, "fr"))
    if PUBLIC_BASE_URL.startswith("https://"):
        body += (f'<p style="margin:22px 0"><a href="{PUBLIC_BASE_URL}/admin/orders/{escape(order["id"])}" '
                 'style="background:#e4002b;color:#fff;text-decoration:none;padding:12px 22px;'
                 'font-weight:bold;text-transform:uppercase;display:inline-block">Traiter la demande</a></p>')
    return subject, _layout("Nouvelle demande d'annulation", body, "fr")


def tpl_cancellation_approved(order: dict, lang: str):
    """Confirmation envoyee au CLIENT quand l'admin valide l'annulation."""
    n = escape(order["order_number"])
    first = escape(order.get("first_name") or "")
    if lang == "en":
        subject = f"Your cancellation for order {n} has been approved"
        body = (f"<p>Hi {first},</p>"
                f"<p>Your cancellation request for order <strong>{n}</strong> has been approved.</p>"
                "<p>The refund has been issued to your original payment method. "
                "It should appear in your account within 5 to 10 business days, depending on your bank.</p>"
                "<p>We're sorry to see you go — feel free to order again anytime.</p>")
        title = "Cancellation approved"
    else:
        subject = f"Votre annulation pour la commande {n} est acceptee"
        body = (f"<p>Bonjour {first},</p>"
                f"<p>Votre demande d'annulation pour la commande <strong>{n}</strong> a ete acceptee.</p>"
                "<p>Le remboursement a ete emis sur votre moyen de paiement initial. "
                "Il apparaitra sur votre compte sous 5 a 10 jours ouvres, selon votre banque.</p>"
                "<p>Nous esperons vous revoir bientot sur STRYKOS.</p>")
        title = "Annulation acceptee"
    return subject, _layout(title, body, lang)


def tpl_cancellation_refused(order: dict, lang: str):
    """Notification envoyee au CLIENT quand l'admin refuse l'annulation."""
    n = escape(order["order_number"])
    first = escape(order.get("first_name") or "")
    reason = escape(order.get("cancellation_refused_reason") or "")
    reason_line_fr = f"<p><strong>Motif :</strong> {reason}</p>" if reason else ""
    reason_line_en = f"<p><strong>Reason:</strong> {reason}</p>" if reason else ""
    if lang == "en":
        subject = f"Your cancellation request for order {n} could not be approved"
        body = (f"<p>Hi {first},</p>"
                f"<p>We're sorry, but your cancellation request for order <strong>{n}</strong> could not be approved.</p>"
                f"{reason_line_en}"
                "<p>Your order will continue its normal processing. "
                "If you have any question, just reply to this email.</p>")
        title = "Cancellation refused"
    else:
        subject = f"Votre demande d'annulation pour la commande {n} n'a pas pu etre acceptee"
        body = (f"<p>Bonjour {first},</p>"
                f"<p>Nous sommes desoles, mais votre demande d'annulation pour la commande <strong>{n}</strong> "
                "n'a pas pu etre acceptee.</p>"
                f"{reason_line_fr}"
                "<p>Votre commande poursuit son traitement normal. "
                "Pour toute question, repondez simplement a cet e-mail.</p>")
        title = "Annulation refusee"
    return subject, _layout(title, body, lang)

def tpl_return_requested(order: dict, lang: str, rma_code: str, products: list[dict]):
    """Accuse de reception + code RMA + instructions au CLIENT."""
    n = escape(order["order_number"])
    rma = escape(rma_code)
    first = escape(order.get("first_name") or "")
    return_type = order.get("return_type") or "refund"

    # Cartes produits
    cells = ""
    for p in products[:6]:
        name = p.get("name_en") if lang == "en" else p.get("name_fr")
        img = p.get("image_url") or ""
        reason = p.get("reason_label") or ""
        img_html = (
            f'<img src="{escape(img)}" width="80" alt="" style="width:80px;display:block;background:#eee;margin-bottom:6px">'
            if img.startswith("https://") else ""
        )
        cells += (
            f'<tr><td style="padding:8px 0;border-bottom:1px solid #eee" valign="top">{img_html}</td>'
            f'<td style="padding:8px 0;border-bottom:1px solid #eee;padding-left:12px" valign="top">'
            f'<div style="font-weight:bold;font-size:14px">{escape(name or "")}</div>'
            f'<div style="font-size:12px;color:#777">{escape(reason)}</div>'
            f'</td></tr>'
        )
    products_table = (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">'
        f'{cells}</table>'
    ) if cells else ""

    # Code RMA dans un cadre visible
    rma_box_fr = (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:#f4f4f2;border-left:4px solid #e4002b">'
        f'<tr><td style="padding:16px 20px">'
        f'<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#777;margin-bottom:4px">Votre code de retour (RMA)</div>'
        f'<div style="font-size:22px;font-weight:800;color:#141416;font-family:monospace;letter-spacing:1px">{rma}</div>'
        f'<div style="font-size:12px;color:#777;margin-top:8px">Conservez ce code : il vous sera demande lors du suivi.</div>'
        f'</td></tr></table>'
    )
    rma_box_en = (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:#f4f4f2;border-left:4px solid #e4002b">'
        f'<tr><td style="padding:16px 20px">'
        f'<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#777;margin-bottom:4px">Your return code (RMA)</div>'
        f'<div style="font-size:22px;font-weight:800;color:#141416;font-family:monospace;letter-spacing:1px">{rma}</div>'
        f'<div style="font-size:12px;color:#777;margin-top:8px">Keep this code safe: it will be required for tracking.</div>'
        f'</td></tr></table>'
    )

    if lang == "en":
        subject = f"We received your return request for order {n}"
        title = "Return request received"
        type_label = "Refund" if return_type == "refund" else "Exchange"
        body = (
            f"<p>Hi {first},</p>"
            f"<p>We've received your return request for order <strong>{n}</strong>.</p>"
            f"<p><strong>Requested solution:</strong> {type_label}</p>"
            + rma_box_en
            + products_table
            + "<p><strong>Next steps:</strong></p>"
            "<ol style='padding-left:20px;margin:8px 0 16px'>"
            "<li>Download the prepaid return label from your account (or from the attached email).</li>"
            "<li>Print it and stick it on your carefully packed parcel.</li>"
            "<li>Drop the parcel off at the indicated drop-off point.</li>"
            "<li>Enter your tracking number in your account to confirm shipment.</li>"
            "</ol>"
            "<p style='font-size:13px;color:#777;margin-top:16px'>Our team will review your request within 24-48 business hours. "
            "The return will then be inspected upon receipt.</p>"
        )
    else:
        subject = f"Nous avons recu votre demande de retour pour la commande {n}"
        title = "Demande de retour recue"
        type_label = "Remboursement" if return_type == "refund" else "Echange"
        body = (
            f"<p>Bonjour {first},</p>"
            f"<p>Nous avons bien recu votre demande de retour pour la commande <strong>{n}</strong>.</p>"
            f"<p><strong>Solution demandee :</strong> {type_label}</p>"
            + rma_box_fr
            + products_table
            + "<p><strong>Prochaines etapes :</strong></p>"
            "<ol style='padding-left:20px;margin:8px 0 16px'>"
            "<li>Telechargez l'etiquette de retour prepayee depuis votre compte (ou depuis cet e-mail).</li>"
            "<li>Imprimez-la et collez-la sur votre colis soigneusement emballe.</li>"
            "<li>Deposez le colis au point de depot indique.</li>"
            "<li>Saisissez votre numero de suivi dans votre compte pour confirmer l'expedition.</li>"
            "</ol>"
            "<p style='font-size:13px;color:#777;margin-top:16px'>Notre equipe examine votre demande sous 24 a 48 heures ouvrees. "
            "Le retour sera ensuite controle a reception.</p>"
        )

    if PUBLIC_BASE_URL.startswith("https://"):
        label = "View my return" if lang == "en" else "Voir mon retour"
        body += (f'<p style="margin:22px 0"><a href="{PUBLIC_BASE_URL}/account" '
                 f'style="background:#e4002b;color:#fff;text-decoration:none;padding:12px 22px;'
                 f'font-weight:bold;text-transform:uppercase;display:inline-block">{label}</a></p>')

    return subject, _layout(title, body, lang)


def tpl_return_admin_notify(order: dict, rma_code: str):
    """Notif ADMIN : nouvelle demande de retour."""
    n = escape(order["order_number"])
    rma = escape(rma_code)
    reason = escape(order.get("return_reason") or "(non precisee)")
    return_type = order.get("return_type") or "refund"
    type_label = "Remboursement" if return_type == "refund" else "Echange"
    subject = f"[STRYKOS] Nouvelle demande de retour — {n}"
    body = (
        f"<p>Le client <strong>{escape(order.get('first_name') or '')} {escape(order.get('last_name') or '')}</strong> "
        f"({escape(order.get('email') or '')}) demande un retour pour la commande <strong>{n}</strong>.</p>"
        f"<p><strong>Code RMA :</strong> <code style='background:#f4f4f2;padding:2px 6px'>{rma}</code></p>"
        f"<p><strong>Type :</strong> {type_label}</p>"
        f"<p><strong>Raison :</strong> {reason}</p>"
        + _items_table(order, "fr")
    )
    if PUBLIC_BASE_URL.startswith("https://"):
        body += (f'<p style="margin:22px 0"><a href="{PUBLIC_BASE_URL}/admin/orders/{escape(order["id"])}" '
                 'style="background:#e4002b;color:#fff;text-decoration:none;padding:12px 22px;'
                 'font-weight:bold;text-transform:uppercase;display:inline-block">Traiter la demande</a></p>')
    return subject, _layout("Nouvelle demande de retour", body, "fr")


def tpl_return_approved(order: dict, lang: str, rma_code: str):
    """Retour valide : instructions d'expedition au CLIENT."""
    n = escape(order["order_number"])
    rma = escape(rma_code)
    first = escape(order.get("first_name") or "")
    return_type = order.get("return_type") or "refund"

    if lang == "en":
        subject = f"Your return request for order {n} has been approved"
        title = "Return approved"
        body = (
            f"<p>Hi {first},</p>"
            f"<p>Good news — your return request for order <strong>{n}</strong> has been approved.</p>"
            f"<p>Your RMA code: <code style='background:#f4f4f2;padding:2px 6px;font-family:monospace'>{rma}</code></p>"
            "<p><strong>Please now ship the item back:</strong></p>"
            "<ol style='padding-left:20px;margin:8px 0 16px'>"
            "<li>Print the prepaid label attached to your account.</li>"
            "<li>Pack the item securely in its original packaging.</li>"
            "<li>Drop off the parcel at the indicated carrier.</li>"
            "<li>Enter your tracking number in your account.</li>"
            "</ol>"
            "<p>As soon as we receive your parcel, our team will inspect it within 2-5 business days.</p>"
        )
    else:
        subject = f"Votre demande de retour pour la commande {n} est approuvee"
        title = "Retour approuve"
        body = (
            f"<p>Bonjour {first},</p>"
            f"<p>Bonne nouvelle — votre demande de retour pour la commande <strong>{n}</strong> a ete approuvee.</p>"
            f"<p>Votre code RMA : <code style='background:#f4f4f2;padding:2px 6px;font-family:monospace'>{rma}</code></p>"
            "<p><strong>Vous pouvez maintenant nous renvoyer l'article :</strong></p>"
            "<ol style='padding-left:20px;margin:8px 0 16px'>"
            "<li>Imprimez l'etiquette de retour depuis votre compte.</li>"
            "<li>Emballez soigneusement l'article dans son emballage d'origine.</li>"
            "<li>Deposez le colis au transporteur indique.</li>"
            "<li>Saisissez votre numero de suivi dans votre compte.</li>"
            "</ol>"
            "<p>Des reception de votre colis, notre equipe le controlera sous 2 a 5 jours ouvres.</p>"
        )
    return subject, _layout(title, body, lang)


def tpl_return_refused(order: dict, lang: str):
    """Retour refuse : raison + renvoi gratuit."""
    n = escape(order["order_number"])
    first = escape(order.get("first_name") or "")
    reason = escape(order.get("return_refused_reason") or "")

    if lang == "en":
        subject = f"Your return request for order {n} could not be approved"
        title = "Return refused"
        reason_line = f"<p><strong>Reason:</strong> {reason}</p>" if reason else ""
        body = (
            f"<p>Hi {first},</p>"
            f"<p>We're sorry, but your return request for order <strong>{n}</strong> could not be approved.</p>"
            f"{reason_line}"
            "<p>The item will be shipped back to you at the original delivery address, "
            "<strong>at no additional cost</strong>.</p>"
            "<p>If you have any question, just reply to this email.</p>"
        )
    else:
        subject = f"Votre demande de retour pour la commande {n} n'a pas pu etre acceptee"
        title = "Retour refuse"
        reason_line = f"<p><strong>Raison :</strong> {reason}</p>" if reason else ""
        body = (
            f"<p>Bonjour {first},</p>"
            f"<p>Nous sommes desoles, mais votre demande de retour pour la commande <strong>{n}</strong> "
            "n'a pas pu etre acceptee.</p>"
            f"{reason_line}"
            "<p>L'article vous sera renvoye a l'adresse de livraison initiale, "
            "<strong>sans frais supplementaires</strong>.</p>"
            "<p>Pour toute question, repondez simplement a cet e-mail.</p>"
        )
    return subject, _layout(title, body, lang)


def tpl_return_received(order: dict, lang: str):
    """Colis retour recu : controle en cours."""
    n = escape(order["order_number"])
    first = escape(order.get("first_name") or "")

    if lang == "en":
        subject = f"We received your return parcel for order {n}"
        title = "Return parcel received"
        body = (
            f"<p>Hi {first},</p>"
            f"<p>We've received your return parcel for order <strong>{n}</strong>. Thank you!</p>"
            "<p>Our team is now inspecting the item. This usually takes 2 to 5 business days.</p>"
            "<p>You will receive a final confirmation email as soon as the inspection is complete, "
            "with your refund or exchange details.</p>"
        )
    else:
        subject = f"Nous avons recu votre colis retour pour la commande {n}"
        title = "Colis retour recu"
        body = (
            f"<p>Bonjour {first},</p>"
            f"<p>Nous avons bien recu votre colis retour pour la commande <strong>{n}</strong>. Merci !</p>"
            "<p>Notre equipe controle actuellement l'article. Cette etape prend generalement 2 a 5 jours ouvres.</p>"
            "<p>Vous recevrez un e-mail de confirmation des que le controle sera termine, "
            "avec les details de votre remboursement ou de votre echange.</p>"
        )
    return subject, _layout(title, body, lang)


def tpl_return_refunded(order: dict, lang: str, amount: float, is_exchange: bool = False):
    """Retour valide apres controle : remboursement emis OU echange envoye."""
    n = escape(order["order_number"])
    first = escape(order.get("first_name") or "")
    amt = _money(amount, order.get("currency", "EUR"))

    if is_exchange:
        if lang == "en":
            subject = f"Your exchange for order {n} has been shipped"
            title = "Exchange shipped"
            body = (
                f"<p>Hi {first},</p>"
                f"<p>Great news — we've inspected your return for order <strong>{n}</strong> and shipped your exchange.</p>"
                "<p>You will receive a separate shipping confirmation email with the tracking number as soon as your new item is on its way.</p>"
                "<p>Thank you for your trust!</p>"
            )
        else:
            subject = f"Votre echange pour la commande {n} a ete expedie"
            title = "Echange expedie"
            body = (
                f"<p>Bonjour {first},</p>"
                f"<p>Bonne nouvelle — nous avons controle votre retour pour la commande <strong>{n}</strong> "
                "et votre echange a ete expedie.</p>"
                "<p>Vous recevrez un e-mail de confirmation d'expedition avec le numero de suivi "
                "des que votre nouvel article sera en route.</p>"
                "<p>Merci de votre confiance !</p>"
            )
        return subject, _layout(title, body, lang)

    if lang == "en":
        subject = f"Your refund for order {n} has been issued"
        title = "Refund issued"
        body = (
            f"<p>Hi {first},</p>"
            f"<p>We've inspected your return for order <strong>{n}</strong> and issued a refund of <strong>{amt}</strong>.</p>"
            "<p>The amount will be credited to your original payment method within 5 to 10 business days, "
            "depending on your bank.</p>"
            "<p>Thank you for shopping with STRYKOS!</p>"
        )
    else:
        subject = f"Votre remboursement pour la commande {n} a ete emis"
        title = "Remboursement emis"
        body = (
            f"<p>Bonjour {first},</p>"
            f"<p>Nous avons controle votre retour pour la commande <strong>{n}</strong> "
            f"et emis un remboursement de <strong>{amt}</strong>.</p>"
            "<p>Le montant sera recrdite sur votre moyen de paiement initial sous 5 a 10 jours ouvres, "
            "selon votre banque.</p>"
            "<p>Merci de votre confiance !</p>"
        )
    return subject, _layout(title, body, lang)


def tpl_review_request(order: dict, lang: str, products: list[dict]):
    """products: [{slug, name_fr, name_en, image_url}]"""
    n = escape(order["order_number"])
    first = escape(order.get("first_name") or "")
    if lang == "en":
        subject = "How was your last STRYKOS order?"
        title = "Share your review"
        body = (
            f"<p>Hi {first},</p>"
            "<p>Your order arrived a few days ago — we hope you're happy with your gear!</p>"
            "<p>Your review helps other players choose the right product and helps us improve our selection.</p>"
        )
        cta = "Leave a review"
    else:
        subject = "Comment s'est passee votre commande STRYKOS ?"
        title = "Donnez votre avis"
        body = (
            f"<p>Bonjour {first},</p>"
            "<p>Votre commande est arrivee il y a quelques jours — nous esperons que votre equipement vous plait !</p>"
            "<p>Votre avis aide les autres joueurs a choisir et nous aide a ameliorer notre selection.</p>"
        )
        cta = "Donner mon avis"

    # Cartes produits (2 par ligne)
    cells = ""
    for p in products[:4]:
        name = p.get("name_en") if lang == "en" else p.get("name_fr")
        img = p.get("image_url") or ""
        url = f"{PUBLIC_BASE_URL}/product/{p['slug']}?review=1"
        img_html = (
            f'<img src="{escape(img)}" width="200" alt="" style="width:100%;display:block;background:#eee">'
            if img.startswith("https://") else ""
        )
        cells += (
            f'<td width="50%" valign="top" style="padding:8px">'
            f'<a href="{url}" style="text-decoration:none;color:#141416">'
            f'{img_html}'
            f'<div style="font-size:14px;font-weight:bold;margin-top:8px">{escape(name or "")}</div>'
            f'<div style="font-size:12px;color:#e4002b;margin-top:6px;text-transform:uppercase;font-weight:bold;letter-spacing:.5px">{escape(cta)} &rarr;</div>'
            f'</a></td>'
        )

    if cells:
        body += (
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">'
            f'<tr>{cells}</tr>'
            '</table>'
        )

    body += (
        f'<p style="margin:22px 0;font-size:12px;color:#777">'
        + ("Order number: " if lang == "en" else "Numero de commande : ")
        + f'<strong>{n}</strong></p>'
    )
    return subject, _layout(title, body, lang)


def tpl_admin_new_order(order: dict):
    n = escape(order["order_number"])
    subject = f"[STRYKOS] Nouvelle commande payée {n} — {_money(order.get('total'), order['currency'])}"
    body = (f"<p>Nouvelle commande payée <strong>{n}</strong> de {escape(order.get('first_name') or '')} {escape(order.get('last_name') or '')} "
            f"({escape(order.get('email') or '')}, {escape(order.get('phone') or '')}).</p>"
            + _items_table(order, "fr") + _address_block(order, "fr"))
    if PUBLIC_BASE_URL.startswith("https://"):
        body += f'<p><a href="{PUBLIC_BASE_URL}/admin/orders/{escape(order["id"])}" style="color:#e4002b;font-weight:bold">Ouvrir dans le cockpit admin</a></p>'
    return subject, _layout("Nouvelle commande", body, "fr")


def tpl_email_change_old(user_dict: dict, old_email: str, new_email: str, old_token: str, cancel_link: str, lang: str):
    """Email envoye a l'ANCIEN email : confirmation + annulation."""
    first = escape(user_dict.get("first_name") or "")
    confirm_url = f"{PUBLIC_BASE_URL}/confirm-email-change?token={old_token}&type=old"

    if lang == "en":
        subject = "Confirm your STRYKOS email change"
        title = "Email change requested"
        body = (
            f"<p>Hi {first},</p>"
            f"<p>A request was made to change the email of your STRYKOS account from "
            f"<strong>{escape(old_email)}</strong> to <strong>{escape(new_email)}</strong>.</p>"
            "<p>To confirm this change, click below. You will also need to confirm from the new email "
            "before the change takes effect.</p>"
            f'<p style="margin:22px 0">'
            f'<a href="{confirm_url}" style="background:#e4002b;color:#fff;text-decoration:none;padding:12px 22px;font-weight:bold;text-transform:uppercase;display:inline-block;margin-right:8px">Confirm</a>'
            f'<a href="{cancel_link}" style="background:#fff;color:#141416;border:1px solid #ccc;text-decoration:none;padding:12px 22px;font-weight:bold;text-transform:uppercase;display:inline-block">Cancel the change</a>'
            f'</p>'
            "<p style='color:#777;font-size:13px'>This link is valid for 24 hours. "
            "If you did not request this change, click Cancel and consider changing your password.</p>"
        )
    else:
        subject = "Confirmez le changement d'email STRYKOS"
        title = "Changement d'email demande"
        body = (
            f"<p>Bonjour {first},</p>"
            f"<p>Une demande de changement de l'email de votre compte STRYKOS a ete faite : de "
            f"<strong>{escape(old_email)}</strong> vers <strong>{escape(new_email)}</strong>.</p>"
            "<p>Pour confirmer ce changement, cliquez ci-dessous. Vous devrez aussi confirmer depuis le "
            "nouvel email avant que le changement prenne effet.</p>"
            f'<p style="margin:22px 0">'
            f'<a href="{confirm_url}" style="background:#e4002b;color:#fff;text-decoration:none;padding:12px 22px;font-weight:bold;text-transform:uppercase;display:inline-block;margin-right:8px">Confirmer</a>'
            f'<a href="{cancel_link}" style="background:#fff;color:#141416;border:1px solid #ccc;text-decoration:none;padding:12px 22px;font-weight:bold;text-transform:uppercase;display:inline-block">Annuler le changement</a>'
            f'</p>'
            "<p style='color:#777;font-size:13px'>Ce lien est valable 24 heures. "
            "Si vous n'etes pas a l'origine de cette demande, cliquez sur Annuler et changez votre mot de passe.</p>"
        )
    return subject, _layout(title, body, lang)


def tpl_email_change_new(user_dict: dict, old_email: str, new_email: str, new_token: str, lang: str):
    """Email envoye au NOUVEL email : confirmation d'appartenance."""
    first = escape(user_dict.get("first_name") or "")
    confirm_url = f"{PUBLIC_BASE_URL}/confirm-email-change?token={new_token}&type=new"

    if lang == "en":
        subject = "Confirm your new email on STRYKOS"
        title = "Confirm your new email"
        body = (
            f"<p>Hi {first},</p>"
            f"<p>You requested to use this email (<strong>{escape(new_email)}</strong>) as the new address "
            "for your STRYKOS account.</p>"
            "<p>Click below to confirm this email belongs to you. "
            "You will also need to confirm from your old email before the change takes effect.</p>"
            f'<p style="margin:22px 0">'
            f'<a href="{confirm_url}" style="background:#e4002b;color:#fff;text-decoration:none;padding:12px 22px;font-weight:bold;text-transform:uppercase;display:inline-block">Confirm my email</a>'
            f'</p>'
            "<p style='color:#777;font-size:13px'>This link is valid for 24 hours. "
            "If you did not request this change, you can safely ignore this email.</p>"
        )
    else:
        subject = "Confirmez votre nouvel email STRYKOS"
        title = "Confirmez votre nouvel email"
        body = (
            f"<p>Bonjour {first},</p>"
            f"<p>Vous avez demande a utiliser cet email (<strong>{escape(new_email)}</strong>) comme nouvelle "
            "adresse pour votre compte STRYKOS.</p>"
            "<p>Cliquez ci-dessous pour confirmer que cet email vous appartient. "
            "Vous devrez aussi confirmer depuis votre ancien email avant que le changement prenne effet.</p>"
            f'<p style="margin:22px 0">'
            f'<a href="{confirm_url}" style="background:#e4002b;color:#fff;text-decoration:none;padding:12px 22px;font-weight:bold;text-transform:uppercase;display:inline-block">Confirmer mon email</a>'
            f'</p>'
            "<p style='color:#777;font-size:13px'>Ce lien est valable 24 heures. "
            "Si vous n'etes pas a l'origine de cette demande, ignorez simplement cet email.</p>"
        )
    return subject, _layout(title, body, lang)


def tpl_cart_abandoned(user_dict: dict, items: list[dict], lang: str, is_second: bool = False,
                       promo_code: str = "", promo_discount_percent: int = 5):
    """Email de relance panier abandonne. items: [{name_fr, name_en, image_url, size, quantity, price}]"""
    first = escape(user_dict.get("first_name") or "")

    cells = ""
    for it in items[:6]:
        name = it.get("name_en") if lang == "en" else it.get("name_fr")
        img = it.get("image_url") or ""
        size = it.get("size") or ""
        qty = it.get("quantity", 1)
        price = it.get("price", 0)
        img_html = (
            f'<img src="{escape(img)}" width="70" alt="" style="width:70px;display:block;background:#eee;margin-bottom:6px">'
            if img.startswith("https://") else ""
        )
        cells += (
            f'<tr><td style="padding:8px 0;border-bottom:1px solid #eee" valign="top">{img_html}</td>'
            f'<td style="padding:8px 0;border-bottom:1px solid #eee;padding-left:12px" valign="top">'
            f'<div style="font-weight:bold;font-size:14px">{escape(name or "")}</div>'
            f'<div style="font-size:12px;color:#777">'
            + (f'Taille {escape(size)} · ' if size else '')
            + f'x{qty} · {price:.2f} &euro;'
            f'</div></td></tr>'
        )

    cart_table = (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">'
        f'{cells}</table>'
    ) if cells else ""

    cta_url = f"{PUBLIC_BASE_URL}/cart"
    cta_label = "Complete my order" if lang == "en" else "Finaliser ma commande"

    promo_box = ""
    if is_second and promo_code:
        if lang == "en":
            promo_box = (
                f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:#fff8e1;border-left:4px solid #e4002b">'
                f'<tr><td style="padding:16px 20px">'
                f'<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#777;margin-bottom:6px">Special offer</div>'
                f'<div style="font-size:18px;font-weight:800;color:#141416">-{promo_discount_percent}% with code</div>'
                f'<div style="font-size:22px;font-weight:800;color:#e4002b;font-family:monospace;letter-spacing:2px;margin-top:6px">{escape(promo_code)}</div>'
                f'</td></tr></table>'
            )
        else:
            promo_box = (
                f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:#fff8e1;border-left:4px solid #e4002b">'
                f'<tr><td style="padding:16px 20px">'
                f'<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#777;margin-bottom:6px">Offre speciale</div>'
                f'<div style="font-size:18px;font-weight:800;color:#141416">-{promo_discount_percent}% avec le code</div>'
                f'<div style="font-size:22px;font-weight:800;color:#e4002b;font-family:monospace;letter-spacing:2px;margin-top:6px">{escape(promo_code)}</div>'
                f'</td></tr></table>'
            )

    if is_second:
        if lang == "en":
            subject = "Your cart is still waiting - here's a little something"
            title = "Still thinking it over?"
            body = (
                f"<p>Hi {first},</p>"
                "<p>Your cart is still waiting. To help you decide, we've added a small gift below.</p>"
            )
        else:
            subject = "Votre panier vous attend - un petit cadeau pour vous aider"
            title = "Toujours en reflexion ?"
            body = (
                f"<p>Bonjour {first},</p>"
                "<p>Votre panier vous attend toujours. Pour vous aider a vous decider, nous vous offrons un petit quelque chose ci-dessous.</p>"
            )
    else:
        if lang == "en":
            subject = "Did you forget something?"
            title = "Your cart is waiting"
            body = (
                f"<p>Hi {first},</p>"
                "<p>You left some great items in your cart. Complete your order in just a few clicks before they sell out.</p>"
            )
        else:
            subject = "Vous avez oublie quelque chose ?"
            title = "Votre panier vous attend"
            body = (
                f"<p>Bonjour {first},</p>"
                "<p>Vous avez laisse de beaux articles dans votre panier. Finalisez votre commande en quelques clics avant qu'ils ne partent.</p>"
            )

    body += promo_box + cart_table
    body += (
        f'<p style="margin:22px 0;text-align:center">'
        f'<a href="{cta_url}" style="background:#e4002b;color:#fff;text-decoration:none;'
        f'padding:14px 30px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;display:inline-block">{cta_label}</a>'
        f'</p>'
    )
    return subject, _layout(title, body, lang)


TEMPLATES = {
    "order_confirmed": tpl_order_confirmed,
    "order_shipped": tpl_order_shipped,
    "order_delivered": tpl_order_delivered,
    "order_refunded": tpl_order_refunded,
}


async def send_order_email(db, order, template: str, **kwargs):
    """order: models.Order. Builds template in the customer's language and sends to the order email."""
    data = order.to_dict()
    lang = order.lang if order.lang in ("fr", "en") else "fr"
    if template == "order_cancelled":
        subject, html = tpl_order_cancelled(data, lang, kwargs.get("refunded", False))
    else:
        subject, html = TEMPLATES[template](data, lang)
    return await send_templated(db, to=order.email, subject=subject, html=html, template=template, order_id=order.id)


async def notify_admin_new_order(db, order):
    if not ADMIN_NOTIFY_EMAIL:
        return None
    subject, html = tpl_admin_new_order(order.to_dict())
    return await send_templated(db, to=ADMIN_NOTIFY_EMAIL, subject=subject, html=html,
                                template="admin_new_order", order_id=order.id)