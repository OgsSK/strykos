import os
import re
import ipaddress
import logging
import httpx
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from models import EmailLog

logger = logging.getLogger("strykos.emails")

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "STRYKOS")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")
ADMIN_NOTIFY_EMAIL = os.environ.get("ADMIN_NOTIFY_EMAIL", "")
PUBLIC_BASE_URL = (os.environ.get("PUBLIC_BASE_URL") or os.environ.get("FRONTEND_URL", "")).rstrip("/")


def emails_enabled() -> bool:
    return os.environ.get("EMAILS_ENABLED", "false").lower() == "true" and bool(EMAIL_KEY)


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
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
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
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                 headers={"X-Email-Key": EMAIL_KEY}, json=payload)
    if resp.status_code >= 400:
        try:
            body = resp.json()
        except ValueError:
            body = {}
        raise RuntimeError(f"{resp.status_code} {body.get('code', '')} {body.get('message', resp.text[:200])}")
    return resp.json().get("id")


async def send_templated(db, *, to: str, subject: str, html: str, template: str, order_id: str | None = None):
    """Send + persist an EmailLog row. Never raises (emails must not break commerce flows)."""
    log = EmailLog(to_email=to, subject=subject, template=template, order_id=order_id)
    if not emails_enabled():
        log.status = "disabled"
    else:
        try:
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


def _layout(title: str, body_html: str, lang: str) -> str:
    footer = ("Envoyé par STRYKOS, boutique football indépendante. Nous ne demandons jamais votre mot de passe ni vos données bancaires par e-mail."
              if lang == "fr" else
              "Sent by STRYKOS, independent football store. We never ask for your password or card details by email.")
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:24px 0;font-family:Arial,Helvetica,sans-serif">'
        '<tr><td align="center">'
        '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff">'
        '<tr><td style="background:#0b0b0d;padding:22px 28px;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:1px">STRY<span style="color:#e4002b">KOS</span></td></tr>'
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


def tpl_admin_new_order(order: dict):
    n = escape(order["order_number"])
    subject = f"[STRYKOS] Nouvelle commande payée {n} — {_money(order.get('total'), order['currency'])}"
    body = (f"<p>Nouvelle commande payée <strong>{n}</strong> de {escape(order.get('first_name') or '')} {escape(order.get('last_name') or '')} "
            f"({escape(order.get('email') or '')}, {escape(order.get('phone') or '')}).</p>"
            + _items_table(order, "fr") + _address_block(order, "fr"))
    if PUBLIC_BASE_URL.startswith("https://"):
        body += f'<p><a href="{PUBLIC_BASE_URL}/admin/orders/{escape(order["id"])}" style="color:#e4002b;font-weight:bold">Ouvrir dans le cockpit admin</a></p>'
    return subject, _layout("Nouvelle commande", body, "fr")


TEMPLATES = {
    "order_confirmed": tpl_order_confirmed,
    "order_shipped": tpl_order_shipped,
    "order_delivered": tpl_order_delivered,
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
