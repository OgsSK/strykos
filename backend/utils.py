import os
import random
import string
from datetime import datetime, timezone
from sqlalchemy import select
from models import Setting

SUPPORTED_CURRENCIES = ["EUR", "USD", "XOF"]
STRIPE_SUPPORTED = {"EUR", "USD"}  # XOF settled in EUR for Stripe in v1

DEFAULT_RATES = {"EUR": 1.0, "USD": 1.08, "XOF": 655.957}
PUBLIC_BASE_URL = (os.environ.get("PUBLIC_BASE_URL") or os.environ.get("FRONTEND_URL", "")).rstrip("/")


def resolve_media(url):
    """Relative /api/media/... paths -> absolute URL for the storefront."""
    if url and url.startswith("/api/media/"):
        return f"{PUBLIC_BASE_URL}{url}"
    return url or ""


def normalize_media(url):
    """Absolute media URL on our own domain -> relative path (domain-independent storage)."""
    if not url:
        return ""
    url = url.strip()
    marker = "/api/media/"
    if marker in url and (url.startswith(PUBLIC_BASE_URL) or url.startswith("http")) and "strykos/" in url:
        return url[url.index(marker):]
    return url

DEFAULT_SETTINGS = {
    "currency": {
        "base": "EUR",
        "rates": DEFAULT_RATES,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    },
    "info_bar": {
        "enabled": True,
        "messages_fr": [
            "Livraison au Mali et en Belgique - boutique multimarque independante",
            "Nouveautes football chaque semaine",
        ],
        "messages_en": [
            "Delivery to Mali and Belgium - independent multi-brand store",
            "New football gear every week",
        ],
    },
    "hero": {
        "image_url": "https://images.unsplash.com/photo-1614170059029-3b7422659b37?crop=entropy&cs=srgb&fm=jpg&q=85&w=2000",
        "title_fr": "L'EQUIPEMENT DES VRAIS JOUEURS",
        "title_en": "GEAR FOR REAL PLAYERS",
        "subtitle_fr": "Maillots authentiques, chaussures et equipements des plus grandes marques, livres au Mali.",
        "subtitle_en": "Authentic jerseys, boots and equipment from the biggest brands, delivered to Mali.",
        "cta_fr": "Decouvrir les produits", "cta_en": "Shop now", "cta_link": "/catalog",
    },
    "shipping": {
        "methods": [
            {"country": "ML", "country_name": "Mali", "name_fr": "Livraison standard Mali", "name_en": "Standard delivery Mali", "cost_eur": 5.0, "delay_fr": "3-6 jours ouvres", "delay_en": "3-6 business days"},
            {"country": "ML", "country_name": "Mali", "name_fr": "Livraison express Bamako", "name_en": "Express Bamako", "cost_eur": 9.0, "delay_fr": "1-2 jours ouvres", "delay_en": "1-2 business days"},
            {"country": "BE", "country_name": "Belgique", "name_fr": "Livraison standard Belgique", "name_en": "Standard delivery Belgium", "cost_eur": 4.5, "delay_fr": "2-4 jours ouvres", "delay_en": "2-4 business days"},
            {"country": "FR", "country_name": "France", "name_fr": "Livraison standard France", "name_en": "Standard delivery France", "cost_eur": 6.0, "delay_fr": "3-5 jours ouvres", "delay_en": "3-5 business days"},
        ],
    },
    "site": {
        "name": "STRYKOS",
        "email": "contact@actoos.com",
        "phone": "+32 465743001",
        "whatsapp": "+32465743001",
        "address_fr": "Bamako, Mali",
        "address_en": "Bamako, Mali",
        "hours_fr": "Lun-Sam 9h-19h",
        "hours_en": "Mon-Sat 9am-7pm",
        "socials": {"instagram": "", "facebook": "", "tiktok": ""},
    },
    "payment_providers": {
        "stripe": {"enabled": True, "mode": "test", "currencies": ["EUR", "USD"], "countries": ["ML", "BE", "FR"]},
        "cinetpay": {"enabled": False, "mode": "test", "currencies": ["XOF"], "countries": ["ML"]},
        "pawapay": {"enabled": False, "mode": "test", "currencies": ["XOF"], "countries": ["ML"]},
    },
}


def round_currency(value, currency):
    if value is None:
        return None
    if currency == "XOF":
        return float(round(value))
    return float(round(value + 1e-9, 2))


def convert_from_eur(amount_eur, currency, rates):
    if amount_eur is None:
        return None
    rate = rates.get(currency, DEFAULT_RATES.get(currency, 1.0))
    return round_currency(float(amount_eur) * rate, currency)


def product_prices(product, rates):
    """Return {EUR:{price,compare_at}, USD:{...}, XOF:{...}} applying manual overrides + sales."""
    out = {}
    price_eur = float(product.price_eur or 0)
    sale_eur = float(product.sale_price_eur) if product.sale_price_eur is not None else None
    manual = {"EUR": price_eur, "USD": product.price_usd, "XOF": product.price_xof}
    for cur in SUPPORTED_CURRENCIES:
        if cur == "EUR":
            base = price_eur
        else:
            m = manual[cur]
            base = float(m) if m is not None else convert_from_eur(price_eur, cur, rates)
        if sale_eur is not None:
            sale = sale_eur if cur == "EUR" else convert_from_eur(sale_eur, cur, rates)
            out[cur] = {"price": round_currency(sale, cur), "compare_at": round_currency(base, cur)}
        else:
            out[cur] = {"price": round_currency(base, cur), "compare_at": None}
    return out


def effective_unit_price_eur(product, variant):
    """Server-side authoritative unit price in EUR reference (incl. variant extra & sale)."""
    base = float(product.sale_price_eur) if product.sale_price_eur is not None else float(product.price_eur or 0)
    extra = float(variant.extra_price_eur or 0) if variant else 0.0
    return base + extra


def serialize_product(product, rates, brand=None, category=None, full=False):
    prices = product_prices(product, rates)
    data = {
        "id": product.id, "slug": product.slug, "sku": product.sku,
        "name_fr": product.name_fr, "name_en": product.name_en,
        "brand": (brand or product.brand).to_dict() if (brand or product.brand) else None,
        "category": (category or product.category).to_dict() if (category or product.category) else None,
        "prices": prices,
        "is_new": product.is_new, "is_featured": product.is_featured,
        "is_best_seller": product.is_best_seller, "on_sale": product.sale_price_eur is not None,
        "club": product.club, "national_team": product.national_team,
        "surface": product.surface, "product_type": product.product_type,
        "colors": product.colors or [],
        "customizable": product.customizable,
        "customization_price_eur": float(product.customization_price_eur or 0),
        "images": [resolve_media(img.url) for img in product.images] if product.images else [],
        "video_url": resolve_media(product.video_url),
        "published": product.published,
    }
    if full:
        data["description_fr"] = product.description_fr
        data["description_en"] = product.description_en
        data["variants"] = [v.to_dict() for v in product.variants]
        data["price_eur"] = float(product.price_eur or 0)
        data["price_usd"] = float(product.price_usd) if product.price_usd is not None else None
        data["price_xof"] = float(product.price_xof) if product.price_xof is not None else None
        data["sale_price_eur"] = float(product.sale_price_eur) if product.sale_price_eur is not None else None
        data["sales_count"] = product.sales_count or 0
        data["created_at"] = product.created_at.isoformat() if product.created_at else None
        total_stock = sum(v.stock for v in product.variants) if product.variants else 0
        data["in_stock"] = total_stock > 0
    else:
        total_stock = sum(v.stock for v in product.variants) if product.variants else 0
        data["in_stock"] = total_stock > 0
    return data


def gen_order_number():
    ts = datetime.now(timezone.utc).strftime("%y%m%d")
    rnd = "".join(random.choices(string.ascii_uppercase + string.digits, k=5))
    return f"STK-{ts}-{rnd}"


async def get_settings(db):
    result = await db.execute(select(Setting))
    rows = result.scalars().all()
    data = {row.key: row.value for row in rows}
    for k, v in DEFAULT_SETTINGS.items():
        data.setdefault(k, v)
    return data


async def get_rates(db):
    result = await db.execute(select(Setting).where(Setting.key == "currency"))
    row = result.scalar_one_or_none()
    if row and row.value and "rates" in row.value:
        return row.value["rates"]
    return DEFAULT_RATES
