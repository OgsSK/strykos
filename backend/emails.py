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

logger = logging.getLogger("cakes.emails")

RESEND_API_URL = "https://api.resend.com/emails"
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "Cakes Shop")
EMAIL_FROM_EMAIL = os.environ.get("EMAIL_FROM_EMAIL", "noreply@actoos.com")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO", "contact@actoos.com")
ADMIN_NOTIFY_EMAIL = os.environ.get("ADMIN_NOTIFY_EMAIL", "")
PUBLIC_BASE_URL = (os.environ.get("PUBLIC_BASE_URL") or os.environ.get("FRONTEND_URL", "")).rstrip("/")

# Contexte global pour le rendu des templates (thread-safe car asyncio single-thread)
_current_brand: dict | None = None

# Palette CAKESSHOP (chocolat + caramel + crème)
C_CHOCOLATE = "#4A2C25"
C_CARAMEL = "#C58B58"
C_CREAM = "#F5EDE0"
C_CREAM_LIGHT = "#FAF5ED"
C_SOFT = "#6B4A42"


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
    try:
        _current_brand = await _get_brand(db)
    except Exception:
        _current_brand = None

    try:
        _brand = _current_brand or {"part1": "CAKES", "part2": "SHOP", "full": "Cakes Shop"}
        subject = _apply_brand(subject, _brand)
        html = _apply_brand(html, _brand)
        old_logo = f'STRY<span style="color:{C_CARAMEL}">KOS</span>'
        new_logo = f'{escape(_brand["part1"])}<span style="color:{C_CARAMEL}">{escape(_brand["part2"])}</span>'
        html = html.replace(old_logo, new_logo)
        old_logo2 = 'STRY<span style="color:#C58B58">KOS</span>'
        html = html.replace(old_logo2, new_logo)
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


# ---------------- Money formatting (FCFA-aware) ----------------
def _money(v, cur):
    """
    Formate un montant dans la devise donnée.
    ⚠️ ATTENTION : `v` doit être DÉJÀ dans la bonne devise (XOF, EUR, etc.).
    Pour convertir depuis l'EUR : `_money(convert_from_eur(amount, cur, rates), cur)`.
    """
    if v is None:
        return ""
    try:
        v = float(v)
    except (TypeError, ValueError):
        return ""

    if cur == "XOF":
        rounded = int(round(v / 100) * 100)
        return f"{rounded:,} FCFA".replace(",", " ")
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
        part1 = s.get("brand_part1") or "CAKES"
        part2 = s.get("brand_part2") or "SHOP"
        name = (s.get("name") or "").strip()
        if not name:
            name = f"{part1}{part2}".strip() or "Cakes Shop"
        return {
            "part1": part1,
            "part2": part2,
            "full": name,
        }
    except Exception:
        return {"part1": "CAKES", "part2": "SHOP", "full": "Cakes Shop"}


def _apply_brand(text: str, brand: dict) -> str:
    if not text or not isinstance(text, str):
        return text or ""
    return text.replace("STRYKOS", brand["full"])


def _layout(title: str, body_html: str, lang: str, brand: dict | None = None) -> str:
    b = brand or _current_brand or {"part1": "CAKES", "part2": "SHOP", "full": "Cakes Shop"}
    footer = (
        f"Envoyé par {b['full']}, pâtisserie artisanale. Nous ne demandons jamais votre mot de passe ni vos données bancaires par e-mail."
        if lang == "fr" else
        f"Sent by {b['full']}, artisan bakery. We never ask for your password or card details by email."
    )
    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{C_CREAM};padding:24px 0;font-family:Arial,Helvetica,sans-serif">'
        '<tr><td align="center">'
        f'<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:{C_CREAM_LIGHT}">'
        f'<tr><td style="background:{C_CHOCOLATE};padding:22px 28px;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:1px">{escape(b["part1"])}<span style="color:{C_CARAMEL}">{escape(b["part2"])}</span></td></tr>'
        f'<tr><td style="padding:28px;color:{C_CHOCOLATE};font-size:15px;line-height:1.55">'
        f'<h1 style="margin:0 0 16px;font-size:22px;text-transform:uppercase;letter-spacing:.5px">{escape(title)}</h1>'
        f'{body_html}'
        '</td></tr>'
        f'<tr><td style="padding:18px 28px;background:{C_CREAM};color:{C_SOFT};font-size:12px;line-height:1.5">{footer}'
        + (f'<br>Contact : <a href="mailto:{escape(EMAIL_REPLY_TO)}" style="color:{C_SOFT}">{escape(EMAIL_REPLY_TO)}</a>' if EMAIL_REPLY_TO else '')
        + '</td></tr></table></td></tr></table>'
    )


def _items_table(order: dict, lang: str) -> str:
    cur = order["currency"]
    rows = ""
    for it in order.get("items") or []:
        name = it.get("name_fr" if lang == "fr" else "name_en") or ""
        portion = it.get("size") or ""
        portion_html = f'<br><span style="color:{C_SOFT};font-size:12px">Portions : {escape(portion)}</span>' if portion else ""
        custom = it.get("customization") or {}
        custom_bits = []
        if custom.get("message") or custom.get("name"):
            custom_bits.append(escape(str(custom.get("message") or custom.get("name") or "")))
        if custom.get("age") or custom.get("number"):
            custom_bits.append(f'{escape(str(custom.get("age") or custom.get("number") or ""))} ans')
        cust_html = ""
        if custom_bits:
            cust_html = f'<br><span style="color:{C_CARAMEL};font-size:12px;font-style:italic">{ " · ".join(custom_bits) }</span>'
        rows += (
            f'<tr><td style="padding:8px 0;border-bottom:1px solid #eee">'
            f'{escape(name)} × {it.get("quantity", 1)}'
            f'{portion_html}{cust_html}'
            f'</td>'
            f'<td align="right" style="padding:8px 0;border-bottom:1px solid #eee;white-space:nowrap">{_money(it.get("line_total"), cur)}</td></tr>'
        )
    lbl = {"fr": ("Sous-total", "Livraison", "Remise", "Total"), "en": ("Subtotal", "Shipping", "Discount", "Total")}[lang if lang in ("fr", "en") else "fr"]
    rows += f'<tr><td style="padding:8px 0;color:{C_SOFT}">{lbl[0]}</td><td align="right" style="padding:8px 0">{_money(order.get("subtotal"), cur)}</td></tr>'
    rows += f'<tr><td style="padding:4px 0;color:{C_SOFT}">{lbl[1]}</td><td align="right" style="padding:4px 0">{_money(order.get("shipping_cost"), cur)}</td></tr>'
    if order.get("discount"):
        rows += f'<tr><td style="padding:4px 0;color:{C_SOFT}">{lbl[2]} ({escape(order.get("promo_code") or "")})</td><td align="right" style="padding:4px 0;color:#1a7f37">-{_money(order.get("discount"), cur)}</td></tr>'
    rows += f'<tr><td style="padding:10px 0;font-weight:bold;font-size:17px">{lbl[3]}</td><td align="right" style="padding:10px 0;font-weight:bold;font-size:17px">{_money(order.get("total"), cur)}</td></tr>'
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">{rows}</table>'


def _track_button(order: dict, lang: str) -> str:
    if not PUBLIC_BASE_URL.startswith("https://"):
        return ""
    url = f"{PUBLIC_BASE_URL}/suivi?order={escape(order['order_number'])}&email={escape(order.get('email') or '')}"
    label = "Suivre ma commande" if lang == "fr" else "Track my order"
    return (f'<p style="margin:22px 0"><a href="{url}" style="background:{C_CARAMEL};color:#fff;text-decoration:none;'
            f'padding:12px 22px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;display:inline-block">{label}</a></p>')


def _address_block(order: dict, lang: str) -> str:
    a = order.get("shipping_address") or {}
    title = "Adresse de livraison" if lang == "fr" else "Shipping address"
    m = order.get("shipping_method") or {}
    method = m.get("name_fr" if lang == "fr" else "name_en", "")
    delay = m.get("delay_fr" if lang == "fr" else "delay_en", "")
    return (f'<p style="margin:14px 0 0;font-weight:bold">{title}</p>'
            f'<p style="margin:4px 0;color:{C_SOFT}">{escape(a.get("first_name", ""))} {escape(a.get("last_name", ""))}<br>'
            f'{escape(a.get("address_line", ""))}<br>{escape(a.get("postal_code", ""))} {escape(a.get("city", ""))}, {escape(a.get("country", ""))}</p>'
            + (f'<p style="margin:4px 0;color:{C_SOFT}">{escape(method)} — {escape(delay)}</p>' if method else ""))


def _customizations_block(order: dict, lang: str, bg: str = "#FAF5ED", border: str = None) -> str:
    border = border or C_CARAMEL
    html = ""
    for it in (order.get("items") or []):
        cust = it.get("customization")
        if not cust:
            continue
        fields = it.get("customization_fields") or []
        lines = []
        if fields:
            for f in fields:
                v = cust.get(f.get("key"))
                if not v:
                    continue
                label = f.get(f"label_{lang}") or f.get("label_fr") or f.get("key")
                if f.get("type") == "select":
                    opt = next((o for o in (f.get("options") or []) if o.get("value") == v), None)
                    if opt:
                        v = opt.get(f"label_{lang}") or opt.get("label_fr") or v
                lines.append(f"{label} : {v}")
        else:
            if cust.get("name"):
                lines.append(f"Message : {cust['name']}")
            if cust.get("number"):
                lines.append(f"Âge : {cust['number']}")
        if lines:
            html += (
                f'<div style="margin:6px 0;padding:10px 14px;background:{bg};'
                f'border-left:3px solid {border};font-size:13px;color:{C_CHOCOLATE}">'
                f'<strong>🎨 {escape(it.get("name_fr" if lang == "fr" else "name_en") or "")}</strong><br>'
                + "<br>".join(escape(x) for x in lines)
                + '</div>'
            )
    if not html:
        return ""
    title = "Personalisations" if lang == "en" else "Personnalisations"
    return (
        f'<div style="margin:16px 0">'
        f'<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;'
        f'color:{C_SOFT};margin-bottom:6px">{title}</div>'
        f'{html}'
        f'</div>'
    )


def _refund_message_block(order: dict, lang: str) -> str:
    if not order.get("refund_message"):
        return ""
    title_msg = "Message from our team" if lang == "en" else "Message de notre équipe"
    return (
        f'<div style="margin:16px 0;padding:16px 20px;background:#FFF8E1;'
        f'border-left:4px solid {C_CARAMEL};">'
        f'<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;'
        f'color:{C_SOFT};margin-bottom:8px">💬 {title_msg}</div>'
        f'<div style="font-size:14px;color:{C_CHOCOLATE};line-height:1.6;white-space:pre-line">'
        f'{escape(order["refund_message"])}'
        f'</div></div>'
    )


# ================================================================
# TEMPLATES
# ================================================================

def tpl_order_confirmed(order: dict, lang: str):
    n = escape(order["order_number"])
    first = escape(order.get("first_name") or "")
    if lang == "en":
        subject = f"Your CAKESSHOP order {n} is confirmed"
        body = (f"<p>Hi {first},</p>"
                f"<p>Thank you! Your payment has been received and your order <strong>{n}</strong> is confirmed. "
                "Our pastry team is already preparing your order with love — we'll email you as soon as it ships.</p>")
        title = "Order confirmed"
    else:
        subject = f"Votre commande CAKESSHOP {n} est confirmée"
        body = (f"<p>Bonjour {first},</p>"
                f"<p>Merci ! Votre paiement a bien été reçu et votre commande <strong>{n}</strong> est confirmée. "
                "Notre équipe pâtisserie prépare déjà votre commande avec soin — nous vous préviendrons par e-mail dès son expédition.</p>")
        title = "Commande confirmée"
    if order.get("payment_notice"):
        body += f'<p style="font-size:13px;color:#8a6d00;background:#fff8e1;padding:10px">{escape(order["payment_notice"])}</p>'

    if order.get("scheduled_date"):
        try:
            from datetime import datetime as _dt
            d = _dt.strptime(order["scheduled_date"], "%Y-%m-%d")
            date_str = d.strftime("%d/%m/%Y")
        except Exception:
            date_str = order["scheduled_date"]
        slot_label = order.get("scheduled_time_slot", "")
        title_sched = "Scheduled delivery" if lang == "en" else "Livraison programmée"
        when_label = "Your order will be ready on" if lang == "en" else "Votre commande sera prête le"
        body += (
            f'<div style="margin:20px 0;padding:16px 20px;background:{C_CREAM};'
            f'border-left:4px solid {C_CARAMEL};font-size:14px">'
            f'<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;'
            f'color:{C_SOFT};margin-bottom:6px">{title_sched}</div>'
            f'<div style="font-size:18px;font-weight:800;color:{C_CHOCOLATE}">'
            f'📅 {when_label} <strong>{date_str}</strong>'
            + (f' — <strong>{escape(slot_label)}</strong>' if slot_label else '')
            + f'</div></div>'
        )

    body += _items_table(order, lang) + _customizations_block(order, lang)

    if order.get("customer_note"):
        note_label = "Your note" if lang == "en" else "Votre note"
        body += (
            f'<div style="margin:16px 0;padding:12px 16px;background:{C_CREAM};'
            f'border-left:4px solid {C_CARAMEL};font-size:13px;color:{C_SOFT}">'
            f'<strong>📝 {note_label} :</strong><br>{escape(order["customer_note"])}'
            f'</div>'
        )
    body += _address_block(order, lang) + _track_button(order, lang)
    return subject, _layout(title, body, lang)


def tpl_order_shipped(order: dict, lang: str):
    n = escape(order["order_number"])
    first = escape(order.get("first_name") or "")
    carrier = escape(order.get("tracking_carrier") or "")
    num = escape(order.get("tracking_number") or "")
    url = (order.get("tracking_url") or "").strip()
    link = ""
    if url.lower().startswith("https://"):
        lbl = "Suivre la livraison" if lang == "fr" else "Track the delivery"
        link = f'<p><a href="{escape(url)}" style="color:{C_CARAMEL};font-weight:bold">{lbl}</a></p>'
    if lang == "en":
        subject = f"Your CAKESSHOP order {n} has shipped"
        body = (f"<p>Hi {first},</p>"
                f"<p>Good news — your order <strong>{n}</strong> just left our kitchen and is on its way.</p>"
                + (f"<p>Carrier: <strong>{carrier}</strong><br>Tracking number: <strong>{num}</strong></p>" if num else ""))
        title = "Order shipped"
    else:
        subject = f"Votre commande CAKESSHOP {n} a été expédiée"
        body = (f"<p>Bonjour {first},</p>"
                f"<p>Bonne nouvelle — votre commande <strong>{n}</strong> vient de quitter notre atelier et est en route.</p>"
                + (f"<p>Transporteur : <strong>{carrier}</strong><br>Numéro de suivi : <strong>{num}</strong></p>" if num else ""))
        title = "Commande expédiée"
    body += link

    # ⭐ Rappel du code OTP
    if order.get("delivery_otp"):
        otp = order["delivery_otp"]
        otp_formatted = f"{otp[:3]} {otp[3:]}" if len(otp) == 6 else otp
        label = "Your delivery code" if lang == "en" else "Votre code de livraison"
        hint = "Give it to the driver." if lang == "en" else "Donnez-le au livreur."
        body += (
            f'<div style="margin:20px 0;padding:16px 20px;background:{C_CREAM};'
            f'border-left:4px solid {C_CARAMEL};text-align:center">'
            f'<div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;'
            f'color:{C_SOFT};margin-bottom:6px">{label}</div>'
            f'<div style="font-size:28px;font-weight:800;color:{C_CHOCOLATE};'
            f'font-family:monospace;letter-spacing:5px">{escape(otp_formatted)}</div>'
            f'<div style="font-size:12px;color:{C_SOFT};margin-top:6px">{hint}</div>'
            f'</div>'
        )

    body += _address_block(order, lang) + _track_button(order, lang)
    return subject, _layout(title, body, lang)


def tpl_order_delivered(order: dict, lang: str):
    n = escape(order["order_number"])
    first = escape(order.get("first_name") or "")
    if lang == "en":
        subject = f"Your CAKESSHOP order {n} has been delivered"
        body = (f"<p>Hi {first},</p>"
                f"<p>Your order <strong>{n}</strong> has been delivered. We hope you love every bite!</p>"
                "<p>If anything is wrong, you have <strong>24 hours</strong> to report it from your account.</p>")
        title = "Order delivered"
    else:
        subject = f"Votre commande CAKESSHOP {n} a été livrée"
        body = (f"<p>Bonjour {first},</p>"
                f"<p>Votre commande <strong>{n}</strong> a été livrée. Nous espérons que chaque bouchée vous plaira !</p>"
                "<p>En cas de problème, vous avez <strong>24 heures</strong> pour le signaler depuis votre compte.</p>")
        title = "Commande livrée"
    body += _track_button(order, lang)
    return subject, _layout(title, body, lang)


def tpl_order_cancelled(order: dict, lang: str, refunded: bool):
    n = escape(order["order_number"])
    first = escape(order.get("first_name") or "")
    if lang == "en":
        subject = f"Your CAKESSHOP order {n} has been {'refunded' if refunded else 'cancelled'}"
        body = f"<p>Hi {first},</p><p>Your order <strong>{n}</strong> has been cancelled."
        body += " The refund has been issued to your original payment method (allow 5-10 business days).</p>" if refunded else "</p>"
        title = "Order refunded" if refunded else "Order cancelled"
    else:
        subject = f"Votre commande CAKESSHOP {n} a été {'remboursée' if refunded else 'annulée'}"
        body = f"<p>Bonjour {first},</p><p>Votre commande <strong>{n}</strong> a été annulée."
        body += " Le remboursement a été émis sur votre moyen de paiement initial (délai 5 à 10 jours ouvrés).</p>" if refunded else "</p>"
        title = "Commande remboursée" if refunded else "Commande annulée"

    body += _refund_message_block(order, lang)
    body += _items_table(order, lang)
    return subject, _layout(title, body, lang)


def tpl_order_refunded(order: dict, lang: str):
    n = escape(order["order_number"])
    first = escape(order.get("first_name") or "")
    if lang == "en":
        subject = f"Your CAKESSHOP order {n} has been refunded"
        body = (f"<p>Hi {first},</p><p>We've issued a refund for your order <strong>{n}</strong>. "
                "The amount will be credited back to your original payment method within 5 to 10 business days, "
                "depending on your bank.</p><p>If you have any question, just reply to this email.</p>")
        title = "Order refunded"
    else:
        subject = f"Votre commande CAKESSHOP {n} a été remboursée"
        body = (f"<p>Bonjour {first},</p><p>Nous avons émis un remboursement pour votre commande <strong>{n}</strong>. "
                "Le montant sera recrédité sur votre moyen de paiement initial sous 5 à 10 jours ouvrés, "
                "selon votre banque.</p><p>Pour toute question, répondez simplement à cet e-mail.</p>")
        title = "Commande remboursée"

    body += _refund_message_block(order, lang)
    body += _items_table(order, lang)
    return subject, _layout(title, body, lang)


def tpl_cancellation_requested(order: dict, lang: str):
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
                f"<p>Nous avons bien reçu votre demande d'annulation pour la commande <strong>{n}</strong>. "
                "Notre équipe va l'examiner sous 24 à 48 heures ouvrées.</p>"
                "<p>Si elle est acceptée, un remboursement intégral sera effectué sur votre moyen de paiement initial.</p>"
                "<p>Vous recevrez un e-mail de confirmation dès qu'une décision sera prise.</p>")
        title = "Demande d'annulation reçue"
    body += _items_table(order, lang)
    return subject, _layout(title, body, lang)


def tpl_cancellation_admin_notify(order: dict):
    n = escape(order["order_number"])
    reason = escape(order.get("cancellation_reason") or "(non précisée)")
    subject = f"[CAKESSHOP] Demande d'annulation — {n}"
    body = (f"<p>Le client <strong>{escape(order.get('first_name') or '')} {escape(order.get('last_name') or '')}</strong> "
            f"({escape(order.get('email') or '')}) demande l'annulation de la commande <strong>{n}</strong>.</p>"
            f"<p><strong>Raison :</strong> {reason}</p>"
            + _items_table(order, "fr"))
    if PUBLIC_BASE_URL.startswith("https://"):
        body += (f'<p style="margin:22px 0"><a href="{PUBLIC_BASE_URL}/admin/orders/{escape(order["id"])}" '
                 f'style="background:{C_CARAMEL};color:#fff;text-decoration:none;padding:12px 22px;'
                 'font-weight:bold;text-transform:uppercase;display:inline-block">Traiter la demande</a></p>')
    return subject, _layout("Nouvelle demande d'annulation", body, "fr")


def tpl_cancellation_approved(order: dict, lang: str):
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
        subject = f"Votre annulation pour la commande {n} est acceptée"
        body = (f"<p>Bonjour {first},</p>"
                f"<p>Votre demande d'annulation pour la commande <strong>{n}</strong> a été acceptée.</p>"
                "<p>Le remboursement a été émis sur votre moyen de paiement initial. "
                "Il apparaîtra sur votre compte sous 5 à 10 jours ouvrés, selon votre banque.</p>"
                "<p>Nous espérons vous revoir bientôt !</p>")
        title = "Annulation acceptée"
    body += _refund_message_block(order, lang)
    return subject, _layout(title, body, lang)


def tpl_cancellation_refused(order: dict, lang: str):
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
                "<p>Your order will continue its normal processing. If you have any question, just reply to this email.</p>")
        title = "Cancellation refused"
    else:
        subject = f"Votre demande d'annulation pour la commande {n} n'a pas pu être acceptée"
        body = (f"<p>Bonjour {first},</p>"
                f"<p>Nous sommes désolés, mais votre demande d'annulation pour la commande <strong>{n}</strong> "
                "n'a pas pu être acceptée.</p>"
                f"{reason_line_fr}"
                "<p>Votre commande poursuit son traitement normal. Pour toute question, répondez simplement à cet e-mail.</p>")
        title = "Annulation refusée"
    return subject, _layout(title, body, lang)


# ================================================================
# ⭐ RÉCLAMATION (plus de retour physique !)
# ================================================================

def tpl_claim_requested(order: dict, lang: str, rma_code: str, products: list[dict]):
    """Accusé de réception d'une RÉCLAMATION client (pas de retour physique)."""
    n = escape(order["order_number"])
    rma = escape(rma_code)
    first = escape(order.get("first_name") or "")

    cells = ""
    for p in products[:6]:
        name = p.get("name_en") if lang == "en" else p.get("name_fr")
        img = p.get("image_url") or ""
        reason = p.get("reason_label") or ""
        img_html = (
            f'<img src="{escape(img)}" width="80" alt="" style="width:80px;display:block;background:#eee;margin-bottom:6px;border-radius:6px">'
            if img.startswith("https://") else ""
        )
        cells += (
            f'<tr><td style="padding:8px 0;border-bottom:1px solid #eee" valign="top">{img_html}</td>'
            f'<td style="padding:8px 0;border-bottom:1px solid #eee;padding-left:12px" valign="top">'
            f'<div style="font-weight:bold;font-size:14px">{escape(name or "")}</div>'
            f'<div style="font-size:12px;color:{C_SOFT};margin-top:2px">Motif : {escape(reason)}</div>'
            f'</td></tr>'
        )
    products_table = (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">'
        f'{cells}</table>'
    ) if cells else ""

    if lang == "en":
        rma_box = (
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:{C_CREAM};border-left:4px solid {C_CARAMEL}">'
            f'<tr><td style="padding:16px 20px">'
            f'<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:{C_SOFT};margin-bottom:4px">Your claim code</div>'
            f'<div style="font-size:22px;font-weight:800;color:{C_CHOCOLATE};font-family:monospace;letter-spacing:1px">{rma}</div>'
            f'<div style="font-size:12px;color:{C_SOFT};margin-top:8px">Keep this code safe: it will be required for any follow-up.</div>'
            f'</td></tr></table>'
        )
    else:
        rma_box = (
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:{C_CREAM};border-left:4px solid {C_CARAMEL}">'
            f'<tr><td style="padding:16px 20px">'
            f'<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:{C_SOFT};margin-bottom:4px">Votre code de réclamation</div>'
            f'<div style="font-size:22px;font-weight:800;color:{C_CHOCOLATE};font-family:monospace;letter-spacing:1px">{rma}</div>'
            f'<div style="font-size:12px;color:{C_SOFT};margin-top:8px">Conservez ce code : il vous sera utile pour tout suivi.</div>'
            f'</td></tr></table>'
        )

    if lang == "en":
        subject = f"We received your claim for order {n}"
        title = "Claim received"
        body = (
            f"<p>Hi {first},</p>"
            f"<p>Thank you for reporting the issue with your order <strong>{n}</strong>. We're truly sorry for the inconvenience.</p>"
            + rma_box
            + products_table
            + "<p><strong>What happens now?</strong></p>"
            "<ol style='padding-left:20px;margin:8px 0 16px'>"
            "<li>Our team reviews your claim within 24-48 business hours.</li>"
            "<li>We may contact you for more details (photos, etc.).</li>"
            "<li>If approved, a refund will be issued to your original payment method.</li>"
            "<li>You'll receive a final confirmation email with the decision.</li>"
            "</ol>"
            f"<p style='font-size:13px;color:{C_SOFT};margin-top:16px'>No need to send anything back — our cakes are made to be enjoyed, not returned.</p>"
        )
    else:
        subject = f"Nous avons reçu votre réclamation pour la commande {n}"
        title = "Réclamation reçue"
        body = (
            f"<p>Bonjour {first},</p>"
            f"<p>Merci d'avoir signalé le problème concernant votre commande <strong>{n}</strong>. Nous sommes sincèrement désolés pour ce désagrément.</p>"
            + rma_box
            + products_table
            + "<p><strong>Que se passe-t-il maintenant ?</strong></p>"
            "<ol style='padding-left:20px;margin:8px 0 16px'>"
            "<li>Notre équipe examine votre réclamation sous 24 à 48 heures ouvrées.</li>"
            "<li>Nous pourrons vous contacter pour plus de détails (photos, etc.).</li>"
            "<li>Si elle est acceptée, un remboursement sera effectué sur votre moyen de paiement initial.</li>"
            "<li>Vous recevrez un e-mail de confirmation avec la décision finale.</li>"
            "</ol>"
            f"<p style='font-size:13px;color:{C_SOFT};margin-top:16px'>Aucun renvoi n'est nécessaire — nos gâteaux sont faits pour être savourés, pas renvoyés.</p>"
        )

    if PUBLIC_BASE_URL.startswith("https://"):
        label = "View my claim" if lang == "en" else "Voir ma réclamation"
        body += (f'<p style="margin:22px 0"><a href="{PUBLIC_BASE_URL}/account" '
                 f'style="background:{C_CARAMEL};color:#fff;text-decoration:none;padding:12px 22px;'
                 f'font-weight:bold;text-transform:uppercase;display:inline-block">{label}</a></p>')

    return subject, _layout(title, body, lang)


def tpl_claim_admin_notify(order: dict, rma_code: str):
    """Notif ADMIN : nouvelle réclamation."""
    n = escape(order["order_number"])
    rma = escape(rma_code)
    reason = escape(order.get("return_reason") or "(non précisée)")
    subject = f"[CAKESSHOP] Nouvelle réclamation — {n}"
    body = (
        f"<p>Le client <strong>{escape(order.get('first_name') or '')} {escape(order.get('last_name') or '')}</strong> "
        f"({escape(order.get('email') or '')}) a signalé un problème sur la commande <strong>{n}</strong>.</p>"
        f"<p><strong>Code de réclamation :</strong> <code style='background:{C_CREAM};padding:2px 6px'>{rma}</code></p>"
        f"<p><strong>Message du client :</strong> {reason}</p>"
        + _items_table(order, "fr")
    )
    if PUBLIC_BASE_URL.startswith("https://"):
        body += (f'<p style="margin:22px 0"><a href="{PUBLIC_BASE_URL}/admin/orders/{escape(order["id"])}" '
                 f'style="background:{C_CARAMEL};color:#fff;text-decoration:none;padding:12px 22px;'
                 'font-weight:bold;text-transform:uppercase;display:inline-block">Traiter la réclamation</a></p>')
    return subject, _layout("Nouvelle réclamation client", body, "fr")


def tpl_claim_approved(order: dict, lang: str, rma_code: str):
    """Réclamation acceptée — remboursement à venir."""
    n = escape(order["order_number"])
    rma = escape(rma_code)
    first = escape(order.get("first_name") or "")
    if lang == "en":
        subject = f"Your claim for order {n} has been approved"
        title = "Claim approved"
        body = (
            f"<p>Hi {first},</p>"
            f"<p>Good news — we've reviewed your claim for order <strong>{n}</strong> and approved it.</p>"
            f"<p>Your claim code: <code style='background:{C_CREAM};padding:2px 6px;font-family:monospace'>{rma}</code></p>"
            "<p>A refund will be issued to your original payment method. You'll receive a separate confirmation email once it's processed.</p>"
            "<p>Thank you for your patience and understanding.</p>"
        )
    else:
        subject = f"Votre réclamation pour la commande {n} est acceptée"
        title = "Réclamation acceptée"
        body = (
            f"<p>Bonjour {first},</p>"
            f"<p>Bonne nouvelle — nous avons examiné votre réclamation pour la commande <strong>{n}</strong> et nous l'avons acceptée.</p>"
            f"<p>Votre code de réclamation : <code style='background:{C_CREAM};padding:2px 6px;font-family:monospace'>{rma}</code></p>"
            "<p>Un remboursement va être émis sur votre moyen de paiement initial. Vous recevrez un e-mail de confirmation dès que le remboursement sera traité.</p>"
            "<p>Merci pour votre patience et votre compréhension.</p>"
        )
    return subject, _layout(title, body, lang)


def tpl_claim_refused(order: dict, lang: str):
    """Réclamation refusée : raison fournie par l'admin."""
    n = escape(order["order_number"])
    first = escape(order.get("first_name") or "")
    reason = escape(order.get("return_refused_reason") or "")
    if lang == "en":
        subject = f"Your claim for order {n} could not be approved"
        title = "Claim refused"
        reason_line = f"<p><strong>Reason:</strong> {reason}</p>" if reason else ""
        body = (
            f"<p>Hi {first},</p>"
            f"<p>We're sorry, but your claim for order <strong>{n}</strong> could not be approved.</p>"
            f"{reason_line}"
            "<p>If you have any questions, just reply to this email — we're happy to help.</p>"
        )
    else:
        subject = f"Votre réclamation pour la commande {n} n'a pas pu être acceptée"
        title = "Réclamation refusée"
        reason_line = f"<p><strong>Raison :</strong> {reason}</p>" if reason else ""
        body = (
            f"<p>Bonjour {first},</p>"
            f"<p>Nous sommes désolés, mais votre réclamation pour la commande <strong>{n}</strong> "
            "n'a pas pu être acceptée.</p>"
            f"{reason_line}"
            "<p>Pour toute question, répondez simplement à cet e-mail — nous sommes là pour vous aider.</p>"
        )
    return subject, _layout(title, body, lang)


def tpl_claim_refunded(order: dict, lang: str, amount: float):
    """Réclamation traitée — remboursement émis (avec message admin)."""
    n = escape(order["order_number"])
    first = escape(order.get("first_name") or "")
    amt = _money(amount, order.get("currency", "XOF"))

    if lang == "en":
        subject = f"Your refund for order {n} has been issued"
        title = "Refund issued"
        body = (
            f"<p>Hi {first},</p>"
            f"<p>Following your claim for order <strong>{n}</strong>, we've issued a refund of <strong>{amt}</strong>.</p>"
            "<p>The amount will be credited to your original payment method within 5 to 10 business days, "
            "depending on your bank.</p>"
            "<p>Thank you for your trust!</p>"
        )
    else:
        subject = f"Votre remboursement pour la commande {n} a été émis"
        title = "Remboursement émis"
        body = (
            f"<p>Bonjour {first},</p>"
            f"<p>Suite à votre réclamation pour la commande <strong>{n}</strong>, nous avons émis un remboursement de <strong>{amt}</strong>.</p>"
            "<p>Le montant sera recrédité sur votre moyen de paiement initial sous 5 à 10 jours ouvrés, "
            "selon votre banque.</p>"
            "<p>Merci de votre confiance !</p>"
        )

    body += _refund_message_block(order, lang)
    return subject, _layout(title, body, lang)


# ⭐ NOUVEAU : Admin demande des infos complémentaires au client
def tpl_claim_info_request(order: dict, lang: str, admin_message: str, requested_types: list):
    """⭐ Admin demande au client des informations complémentaires."""
    n = escape(order["order_number"])
    first = escape(order.get("first_name") or "")
    rma = escape(order.get("return_rma_code") or "")

    types_labels = []
    if "photo" in (requested_types or []):
        types_labels.append("📸 Photos")
    if "video" in (requested_types or []):
        types_labels.append("🎥 Vidéos")
    types_str = " · ".join(types_labels)

    account_url = f"{PUBLIC_BASE_URL}/account" if PUBLIC_BASE_URL.startswith("https://") else ""

    if lang == "en":
        subject = f"We need more info about your claim — {n}"
        title = "More info needed"
        body = (
            f"<p>Hi {first},</p>"
            f"<p>Thank you for your claim about order <strong>{n}</strong>. Our team has reviewed it and needs a bit more information to proceed.</p>"
            f'<div style="margin:16px 0;padding:16px 20px;background:#FFF8E1;'
            f'border-left:4px solid {C_CARAMEL};font-size:14px">'
            f'<strong>💬 Message from our team :</strong><br>'
            f'<span style="white-space:pre-line">{escape(admin_message)}</span>'
            f'</div>'
            + (f'<p><strong>Requested :</strong> {escape(types_str)}</p>' if types_str else '')
            + "<p>You can reply directly from your customer account — just attach the requested files and add a message.</p>"
        )
    else:
        subject = f"Nous avons besoin d'informations supplémentaires — {n}"
        title = "Informations complémentaires"
        body = (
            f"<p>Bonjour {first},</p>"
            f"<p>Merci pour votre réclamation concernant la commande <strong>{n}</strong>. Notre équipe l'a examinée et aurait besoin d'informations complémentaires pour poursuivre.</p>"
            f'<div style="margin:16px 0;padding:16px 20px;background:#FFF8E1;'
            f'border-left:4px solid {C_CARAMEL};font-size:14px">'
            f'<strong>💬 Message de notre équipe :</strong><br>'
            f'<span style="white-space:pre-line">{escape(admin_message)}</span>'
            f'</div>'
            + (f'<p><strong>Demandé :</strong> {escape(types_str)}</p>' if types_str else '')
            + "<p>Vous pouvez répondre directement depuis votre compte client — joignez les fichiers demandés et ajoutez un message.</p>"
        )

    if account_url:
        cta = "Répondre depuis mon compte" if lang == "fr" else "Reply from my account"
        body += (
            f'<p style="margin:22px 0"><a href="{account_url}" '
            f'style="background:{C_CARAMEL};color:#fff;text-decoration:none;padding:12px 22px;'
            f'font-weight:bold;text-transform:uppercase;display:inline-block">{cta}</a></p>'
        )
    return subject, _layout(title, body, lang)


# ⭐ NOUVEAU : Notif admin — le client a répondu
def tpl_claim_client_replied(order: dict, client_message: str, media_urls: list):
    """⭐ Notif admin : le client a répondu à la demande d'infos."""
    n = escape(order["order_number"])
    subject = f"[CAKESSHOP] Réponse du client — Réclamation {n}"

    media_html = ""
    for m in (media_urls or [])[:6]:
        url = m.get("url") or ""
        typ = m.get("type") or "image"
        if not url.startswith("https://"):
            continue
        if typ == "image":
            media_html += f'<img src="{escape(url)}" width="120" alt="" style="margin:4px;border-radius:4px">'
        else:
            media_html += f'<div style="margin:4px 0"><a href="{escape(url)}" style="color:{C_CARAMEL}">🎥 Vidéo</a></div>'

    body = (
        f"<p>Le client <strong>{escape(order.get('first_name') or '')} {escape(order.get('last_name') or '')}</strong> "
        f"({escape(order.get('email') or '')}) a répondu à votre demande d'informations pour la réclamation <strong>{n}</strong>.</p>"
        f'<div style="margin:16px 0;padding:12px 16px;background:{C_CREAM};'
        f'border-left:4px solid {C_CARAMEL};font-size:14px">'
        f'<strong>💬 Message du client :</strong><br>'
        f'<span style="white-space:pre-line">{escape(client_message or "(aucun texte)")}</span>'
        f'</div>'
        + (f'<div style="margin:16px 0">{media_html}</div>' if media_html else '')
    )
    if PUBLIC_BASE_URL.startswith("https://"):
        body += (f'<p style="margin:22px 0"><a href="{PUBLIC_BASE_URL}/admin/orders/{escape(order["id"])}" '
                 f'style="background:{C_CARAMEL};color:#fff;text-decoration:none;padding:12px 22px;'
                 'font-weight:bold;text-transform:uppercase;display:inline-block">Traiter la réclamation</a></p>')
    return subject, _layout("Réponse du client", body, "fr")


def tpl_review_request(order: dict, lang: str, products: list[dict]):
    n = escape(order["order_number"])
    first = escape(order.get("first_name") or "")
    if lang == "en":
        subject = "How was your last CAKESSHOP order?"
        title = "Share your review"
        body = (
            f"<p>Hi {first},</p>"
            "<p>Your order arrived a few days ago — we hope every bite was delicious!</p>"
            "<p>Your review helps other customers choose the perfect cake and helps us improve our selection.</p>"
        )
        cta = "Leave a review"
    else:
        subject = "Comment s'est passée votre commande CAKESSHOP ?"
        title = "Donnez votre avis"
        body = (
            f"<p>Bonjour {first},</p>"
            "<p>Votre commande est arrivée il y a quelques jours — nous espérons que chaque bouchée était délicieuse !</p>"
            "<p>Votre avis aide les autres clients à choisir le gâteau parfait et nous aide à améliorer notre sélection.</p>"
        )
        cta = "Donner mon avis"

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
            f'<a href="{url}" style="text-decoration:none;color:{C_CHOCOLATE}">'
            f'{img_html}'
            f'<div style="font-size:14px;font-weight:bold;margin-top:8px">{escape(name or "")}</div>'
            f'<div style="font-size:12px;color:{C_CARAMEL};margin-top:6px;text-transform:uppercase;font-weight:bold;letter-spacing:.5px">{escape(cta)} &rarr;</div>'
            f'</a></td>'
        )

    if cells:
        body += (
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">'
            f'<tr>{cells}</tr>'
            '</table>'
        )

    body += (
        f'<p style="margin:22px 0;font-size:12px;color:{C_SOFT}">'
        + ("Order number: " if lang == "en" else "Numéro de commande : ")
        + f'<strong>{n}</strong></p>'
    )
    return subject, _layout(title, body, lang)


def tpl_admin_new_order(order: dict):
    n = escape(order["order_number"])
    subject = f"[CAKESSHOP] Nouvelle commande payée {n} — {_money(order.get('total'), order['currency'])}"

    sched_block = ""
    if order.get("scheduled_date"):
        sched_block = (
            f'<div style="margin:16px 0;padding:12px 16px;background:#E3F2FD;'
            f'border-left:4px solid #1976D2;font-size:14px">'
            f'<strong>📅 Livraison programmée :</strong> {escape(order["scheduled_date"])}'
            f' — {escape(order.get("scheduled_time_slot", ""))}'
            f'</div>'
        )

    note_block = ""
    if order.get("customer_note"):
        note_block = (
            f'<div style="margin:16px 0;padding:12px 16px;background:#fff8e1;'
            f'border-left:4px solid {C_CARAMEL};font-size:14px">'
            f'<strong>📝 Note du client :</strong><br>'
            f'{escape(order["customer_note"])}'
            f'</div>'
        )

    body = (
        f"<p>Nouvelle commande payée <strong>{n}</strong> de {escape(order.get('first_name') or '')} {escape(order.get('last_name') or '')} "
        f"({escape(order.get('email') or '')}, {escape(order.get('phone') or '')}).</p>"
        + sched_block
        + note_block
        + _items_table(order, "fr")
    )

    admin_customs = _customizations_block(order, "fr", bg="#FFF3CD", border="#F0AD4E")
    if admin_customs:
        body += (
            f'<div style="margin:16px 0">'
            f'<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;'
            f'color:#856404;margin-bottom:6px">🎨 Personnalisations client</div>'
            f'{admin_customs}'
            f'</div>'
        )

    body += _address_block(order, "fr")

    if PUBLIC_BASE_URL.startswith("https://"):
        body += f'<p><a href="{PUBLIC_BASE_URL}/admin/orders/{escape(order["id"])}" style="color:{C_CARAMEL};font-weight:bold">Ouvrir dans l\'admin</a></p>'
    return subject, _layout("Nouvelle commande", body, "fr")


def tpl_email_change_old(user_dict: dict, old_email: str, new_email: str, old_token: str, cancel_link: str, lang: str):
    first = escape(user_dict.get("first_name") or "")
    confirm_url = f"{PUBLIC_BASE_URL}/confirm-email-change?token={old_token}&type=old"
    if lang == "en":
        subject = "Confirm your CAKESSHOP email change"
        title = "Email change requested"
        body = (
            f"<p>Hi {first},</p>"
            f"<p>A request was made to change the email of your CAKESSHOP account from "
            f"<strong>{escape(old_email)}</strong> to <strong>{escape(new_email)}</strong>.</p>"
            "<p>To confirm this change, click below. You will also need to confirm from the new email "
            "before the change takes effect.</p>"
            f'<p style="margin:22px 0">'
            f'<a href="{confirm_url}" style="background:{C_CARAMEL};color:#fff;text-decoration:none;padding:12px 22px;font-weight:bold;text-transform:uppercase;display:inline-block;margin-right:8px">Confirm</a>'
            f'<a href="{cancel_link}" style="background:#fff;color:{C_CHOCOLATE};border:1px solid #ccc;text-decoration:none;padding:12px 22px;font-weight:bold;text-transform:uppercase;display:inline-block">Cancel the change</a>'
            f'</p>'
            f"<p style='color:{C_SOFT};font-size:13px'>This link is valid for 24 hours. "
            "If you did not request this change, click Cancel and consider changing your password.</p>"
        )
    else:
        subject = "Confirmez le changement d'email CAKESSHOP"
        title = "Changement d'email demandé"
        body = (
            f"<p>Bonjour {first},</p>"
            f"<p>Une demande de changement de l'email de votre compte CAKESSHOP a été faite : de "
            f"<strong>{escape(old_email)}</strong> vers <strong>{escape(new_email)}</strong>.</p>"
            "<p>Pour confirmer ce changement, cliquez ci-dessous. Vous devrez aussi confirmer depuis le "
            "nouvel email avant que le changement prenne effet.</p>"
            f'<p style="margin:22px 0">'
            f'<a href="{confirm_url}" style="background:{C_CARAMEL};color:#fff;text-decoration:none;padding:12px 22px;font-weight:bold;text-transform:uppercase;display:inline-block;margin-right:8px">Confirmer</a>'
            f'<a href="{cancel_link}" style="background:#fff;color:{C_CHOCOLATE};border:1px solid #ccc;text-decoration:none;padding:12px 22px;font-weight:bold;text-transform:uppercase;display:inline-block">Annuler le changement</a>'
            f'</p>'
            f"<p style='color:{C_SOFT};font-size:13px'>Ce lien est valable 24 heures. "
            "Si vous n'êtes pas à l'origine de cette demande, cliquez sur Annuler et changez votre mot de passe.</p>"
        )
    return subject, _layout(title, body, lang)


def tpl_email_change_new(user_dict: dict, old_email: str, new_email: str, new_token: str, lang: str):
    first = escape(user_dict.get("first_name") or "")
    confirm_url = f"{PUBLIC_BASE_URL}/confirm-email-change?token={new_token}&type=new"
    if lang == "en":
        subject = "Confirm your new email on CAKESSHOP"
        title = "Confirm your new email"
        body = (
            f"<p>Hi {first},</p>"
            f"<p>You requested to use this email (<strong>{escape(new_email)}</strong>) as the new address "
            "for your CAKESSHOP account.</p>"
            "<p>Click below to confirm this email belongs to you. "
            "You will also need to confirm from your old email before the change takes effect.</p>"
            f'<p style="margin:22px 0">'
            f'<a href="{confirm_url}" style="background:{C_CARAMEL};color:#fff;text-decoration:none;padding:12px 22px;font-weight:bold;text-transform:uppercase;display:inline-block">Confirm my email</a>'
            f'</p>'
            f"<p style='color:{C_SOFT};font-size:13px'>This link is valid for 24 hours. "
            "If you did not request this change, you can safely ignore this email.</p>"
        )
    else:
        subject = "Confirmez votre nouvel email CAKESSHOP"
        title = "Confirmez votre nouvel email"
        body = (
            f"<p>Bonjour {first},</p>"
            f"<p>Vous avez demandé à utiliser cet email (<strong>{escape(new_email)}</strong>) comme nouvelle "
            "adresse pour votre compte CAKESSHOP.</p>"
            "<p>Cliquez ci-dessous pour confirmer que cet email vous appartient. "
            "Vous devrez aussi confirmer depuis votre ancien email avant que le changement prenne effet.</p>"
            f'<p style="margin:22px 0">'
            f'<a href="{confirm_url}" style="background:{C_CARAMEL};color:#fff;text-decoration:none;padding:12px 22px;font-weight:bold;text-transform:uppercase;display:inline-block">Confirmer mon email</a>'
            f'</p>'
            f"<p style='color:{C_SOFT};font-size:13px'>Ce lien est valable 24 heures. "
            "Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>"
        )
    return subject, _layout(title, body, lang)


def tpl_cart_abandoned(user_dict: dict, items: list[dict], lang: str, is_second: bool = False,
                       promo_code: str = "", promo_discount_percent: int = 5):
    first = escape(user_dict.get("first_name") or "")

    cells = ""
    for it in items[:6]:
        name = it.get("name_en") if lang == "en" else it.get("name_fr")
        img = it.get("image_url") or ""
        size = it.get("size") or ""
        qty = it.get("quantity", 1)
        price = it.get("price", 0)
        img_html = (
            f'<img src="{escape(img)}" width="70" alt="" style="width:70px;display:block;background:#eee;margin-bottom:6px;border-radius:4px">'
            if img.startswith("https://") else ""
        )
        portion_html = f'Portions : {escape(size)} · ' if size else ''
        cells += (
            f'<tr><td style="padding:8px 0;border-bottom:1px solid #eee" valign="top">{img_html}</td>'
            f'<td style="padding:8px 0;border-bottom:1px solid #eee;padding-left:12px" valign="top">'
            f'<div style="font-weight:bold;font-size:14px">{escape(name or "")}</div>'
            f'<div style="font-size:12px;color:{C_SOFT}">'
            f'{portion_html}x{qty} · {price:.0f} FCFA'
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
        promo_title = "Special offer" if lang == "en" else "Offre spéciale"
        promo_with = "with code" if lang == "en" else "avec le code"
        promo_box = (
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:#fff8e1;border-left:4px solid {C_CARAMEL}">'
            f'<tr><td style="padding:16px 20px">'
            f'<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:{C_SOFT};margin-bottom:6px">{promo_title}</div>'
            f'<div style="font-size:18px;font-weight:800;color:{C_CHOCOLATE}">-{promo_discount_percent}% {promo_with}</div>'
            f'<div style="font-size:22px;font-weight:800;color:{C_CARAMEL};font-family:monospace;letter-spacing:2px;margin-top:6px">{escape(promo_code)}</div>'
            f'</td></tr></table>'
        )

    if is_second:
        if lang == "en":
            subject = "Your cart is still waiting - here's a little something"
            title = "Still thinking it over?"
            body = (f"<p>Hi {first},</p>"
                    "<p>Your cart is still waiting. To help you decide, we've added a small gift below.</p>")
        else:
            subject = "Votre panier vous attend - un petit cadeau pour vous aider"
            title = "Toujours en réflexion ?"
            body = (f"<p>Bonjour {first},</p>"
                    "<p>Votre panier vous attend toujours. Pour vous aider à vous décider, nous vous offrons un petit quelque chose ci-dessous.</p>")
    else:
        if lang == "en":
            subject = "Did you forget something?"
            title = "Your cart is waiting"
            body = (f"<p>Hi {first},</p>"
                    "<p>You left some delicious items in your cart. Complete your order in just a few clicks before they sell out.</p>")
        else:
            subject = "Vous avez oublié quelque chose ?"
            title = "Votre panier vous attend"
            body = (f"<p>Bonjour {first},</p>"
                    "<p>Vous avez laissé de délicieux gâteaux dans votre panier. Finalisez votre commande en quelques clics avant qu'ils ne partent.</p>")

    body += promo_box + cart_table
    body += (
        f'<p style="margin:22px 0;text-align:center">'
        f'<a href="{cta_url}" style="background:{C_CARAMEL};color:#fff;text-decoration:none;'
        f'padding:14px 30px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;display:inline-block">{cta_label}</a>'
        f'</p>'
    )
    return subject, _layout(title, body, lang)


# ================================================================
# ⭐ INVITATION LIVREUR + CODE OTP CLIENT
# ================================================================

def tpl_driver_invitation(user_dict: dict, invite_token: str, lang: str = "fr"):
    """Email envoyé à un nouveau livreur pour activer son compte."""
    first = escape(user_dict.get("first_name") or "")
    setup_url = f"{PUBLIC_BASE_URL}/livreur/setup?token={invite_token}"

    if lang == "en":
        subject = "Welcome to the CAKESSHOP delivery team"
        title = "You're invited!"
        body = (
            f"<p>Hi {first},</p>"
            "<p>You have been invited to join the CAKESSHOP delivery team.</p>"
            "<p>To activate your account, click the button below and create your password.</p>"
            f'<p style="margin:22px 0;text-align:center">'
            f'<a href="{setup_url}" style="background:{C_CARAMEL};color:#fff;text-decoration:none;'
            f'padding:14px 30px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;display:inline-block">'
            f'Create my password</a></p>'
            "<p>This link is valid for <strong>7 days</strong>.</p>"
            "<p>Once activated, you can access your driver space with your delivery codes.</p>"
            f"<p style='color:{C_SOFT};font-size:13px;margin-top:20px'>If you did not expect this email, you can ignore it.</p>"
        )
    else:
        subject = "Bienvenue dans l'équipe de livraison CAKESSHOP"
        title = "Vous êtes invité !"
        body = (
            f"<p>Bonjour {first},</p>"
            "<p>Vous avez été invité(e) à rejoindre l'équipe de livraison CAKESSHOP.</p>"
            "<p>Pour activer votre compte, cliquez sur le bouton ci-dessous et créez votre mot de passe.</p>"
            f'<p style="margin:22px 0;text-align:center">'
            f'<a href="{setup_url}" style="background:{C_CARAMEL};color:#fff;text-decoration:none;'
            f'padding:14px 30px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;display:inline-block">'
            f'Créer mon mot de passe</a></p>'
            "<p>Ce lien est valable <strong>7 jours</strong>.</p>"
            "<p>Une fois activé, vous pourrez accéder à votre espace livreur et saisir les codes de livraison.</p>"
            f"<p style='color:{C_SOFT};font-size:13px;margin-top:20px'>Si vous n'êtes pas à l'origine de cette invitation, ignorez simplement cet e-mail.</p>"
        )
    return subject, _layout(title, body, lang)


def tpl_delivery_otp_client(order: dict, otp: str, lang: str):
    """Email envoyé au client avec son code OTP de livraison."""
    first = escape(order.get("first_name") or "")
    n = escape(order["order_number"])

    # Formatage du code en groupes de 3 : "482913" → "482 913"
    otp_formatted = f"{otp[:3]} {otp[3:]}" if len(otp) == 6 else otp

    if lang == "en":
        subject = f"Your delivery code for order {n}"
        title = "Your order is on its way"
        body = (
            f"<p>Hi {first},</p>"
            f"<p>Great news — your order <strong>{n}</strong> is on its way.</p>"
            f"<p>Give this code to the delivery person to confirm receipt:</p>"
            f'<div style="margin:24px 0;padding:24px 20px;background:{C_CREAM};'
            f'border-left:4px solid {C_CARAMEL};text-align:center">'
            f'<div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;'
            f'color:{C_SOFT};margin-bottom:8px">Delivery code</div>'
            f'<div style="font-size:36px;font-weight:800;color:{C_CHOCOLATE};'
            f'font-family:monospace;letter-spacing:6px">{escape(otp_formatted)}</div>'
            f'</div>'
            f"<p style='color:{C_SOFT};font-size:13px'>This code is valid for 7 days. "
            f"Do not share it before the delivery. You can also find it in your account.</p>"
        )
    else:
        subject = f"Votre code de livraison pour la commande {n}"
        title = "Votre commande est en route"
        body = (
            f"<p>Bonjour {first},</p>"
            f"<p>Bonne nouvelle — votre commande <strong>{n}</strong> est en route.</p>"
            f"<p>Donnez ce code au livreur pour confirmer la réception :</p>"
            f'<div style="margin:24px 0;padding:24px 20px;background:{C_CREAM};'
            f'border-left:4px solid {C_CARAMEL};text-align:center">'
            f'<div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;'
            f'color:{C_SOFT};margin-bottom:8px">Code de livraison</div>'
            f'<div style="font-size:36px;font-weight:800;color:{C_CHOCOLATE};'
            f'font-family:monospace;letter-spacing:6px">{escape(otp_formatted)}</div>'
            f'</div>'
            f"<p style='color:{C_SOFT};font-size:13px'>Ce code est valable 7 jours. "
            f"Ne le partagez pas avant la livraison. Vous le retrouvez aussi dans votre compte.</p>"
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