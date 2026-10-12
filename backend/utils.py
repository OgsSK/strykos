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
    """Retourne le chemin relatif. Le frontend le prefixe avec REACT_APP_BACKEND_URL."""
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
            "Boutique football multimarque independante - livraison internationale suivie",
            "Nouveautes football chaque semaine",
        ],
        "messages_en": [
            "Independent multi-brand football store - tracked worldwide delivery",
            "New football gear every week",
        ],
    },
    "hero": {
        "interval_ms": 7000,
        "slides": [
            {"video_url": "https://assets.mixkit.co/videos/43482/43482-720.mp4",
             "image_url": "https://images.unsplash.com/photo-1614170059029-3b7422659b37?crop=entropy&cs=srgb&fm=jpg&q=85&w=2000",
             "title_fr": "L'EQUIPEMENT DES VRAIS JOUEURS", "title_en": "GEAR FOR REAL PLAYERS",
             "subtitle_fr": "Maillots authentiques, chaussures et equipements des plus grandes marques. Performance et style, sans compromis.",
             "subtitle_en": "Authentic jerseys, boots and gear from the biggest brands. Performance and style, no compromise.",
             "cta_fr": "Decouvrir les produits", "cta_en": "Shop now", "cta_link": "/catalog"},
            {"video_url": "https://assets.mixkit.co/videos/43494/43494-720.mp4", "image_url": "https://images.unsplash.com/photo-1552066379-e7bfd22155c5?crop=entropy&cs=srgb&fm=jpg&q=80&w=1800",
             "title_fr": "NOUVELLE SAISON, NOUVEAUX MAILLOTS", "title_en": "NEW SEASON, NEW JERSEYS",
             "subtitle_fr": "Les dernieres tuniques des clubs et selections, personnalisables nom et numero.",
             "subtitle_en": "The latest club and national team shirts, customizable with name and number.",
             "cta_fr": "Voir les nouveautes", "cta_en": "See new arrivals", "cta_link": "/catalog?is_new=true"},
            {"video_url": "https://assets.mixkit.co/videos/42541/42541-720.mp4", "image_url": "https://images.unsplash.com/photo-1511886929837-354d827aae26?crop=entropy&cs=srgb&fm=jpg&q=80&w=1800",
             "title_fr": "CHAUSSURES POUR CHAQUE TERRAIN", "title_en": "BOOTS FOR EVERY PITCH",
             "subtitle_fr": "FG, AG, terrain synthetique ou futsal : trouvez la paire qui vous correspond.",
             "subtitle_en": "FG, AG, turf or futsal: find the pair that fits your game.",
             "cta_fr": "Voir les chaussures", "cta_en": "Shop boots", "cta_link": "/catalog?category=chaussures"},
        ],
    },
    "icons": {"title_fr": "NOS ESSENTIELS", "title_en": "OUR ESSENTIALS", "items": [{"label_fr": "Maillots", "label_en": "Jerseys", "image_url": "https://images.unsplash.com/photo-1552066379-e7bfd22155c5?crop=entropy&cs=srgb&fm=jpg&q=80&w=300&h=300&fit=crop", "link": "/catalog?category=maillots"}, {"label_fr": "Crampons FG", "label_en": "FG boots", "image_url": "https://images.unsplash.com/photo-1511886929837-354d827aae26?crop=entropy&cs=srgb&fm=jpg&q=80&w=300&h=300&fit=crop", "link": "/catalog?category=chaussures&surface=FG"}, {"label_fr": "Ballons", "label_en": "Balls", "image_url": "https://images.unsplash.com/photo-1575361204480-aadea25e6e68?crop=entropy&cs=srgb&fm=jpg&q=80&w=300&h=300&fit=crop", "link": "/catalog?category=equipements&product_type=ball"}, {"label_fr": "Vetements", "label_en": "Apparel", "image_url": "https://images.unsplash.com/photo-1540254597053-3901b858d40f?crop=entropy&cs=srgb&fm=jpg&q=80&w=300&h=300&fit=crop", "link": "/catalog?category=vetements"}, {"label_fr": "Sacs", "label_en": "Bags", "image_url": "https://images.unsplash.com/photo-1692506530242-c12d6c3ae2e2?crop=entropy&cs=srgb&fm=jpg&q=80&w=300&h=300&fit=crop", "link": "/catalog?category=accessoires"}, {"label_fr": "Protections", "label_en": "Protection", "image_url": "https://images.unsplash.com/photo-1789925941480-aebc24c038af?crop=entropy&cs=srgb&fm=jpg&q=80&w=300&h=300&fit=crop", "link": "/catalog?category=equipements"}, {"label_fr": "Selections", "label_en": "National teams", "image_url": "https://images.unsplash.com/photo-1614170059029-3b7422659b37?crop=entropy&cs=srgb&fm=jpg&q=80&w=300&h=300&fit=crop", "link": "/catalog?category=maillots&product_type=national"}, {"label_fr": "Marques locales", "label_en": "Local brands", "image_url": "https://images.unsplash.com/photo-1662096909714-e2f206d0a636?crop=entropy&cs=srgb&fm=jpg&q=80&w=300&h=300&fit=crop", "link": "/brands"}, {"label_fr": "Nike", "label_en": "Nike", "image_url": "https://images.unsplash.com/photo-1529900748604-07564a03e7a6?crop=entropy&cs=srgb&fm=jpg&q=80&w=300&h=300&fit=crop", "link": "/catalog?brand=nike"}, {"label_fr": "adidas", "label_en": "adidas", "image_url": "https://images.unsplash.com/photo-1511426463457-0571e247d816?crop=entropy&cs=srgb&fm=jpg&q=80&w=300&h=300&fit=crop", "link": "/catalog?brand=adidas"}, {"label_fr": "Puma", "label_en": "Puma", "image_url": "https://images.unsplash.com/photo-1770029606852-38309868b4ee?crop=entropy&cs=srgb&fm=jpg&q=80&w=300&h=300&fit=crop", "link": "/catalog?brand=puma"}, {"label_fr": "New Balance", "label_en": "New Balance", "image_url": "https://images.unsplash.com/photo-1567159169514-2211f0280f5f?crop=entropy&cs=srgb&fm=jpg&q=80&w=300&h=300&fit=crop", "link": "/catalog?brand=new-balance"}, {"label_fr": "Nouveautes", "label_en": "New arrivals", "image_url": "https://images.unsplash.com/photo-1616124619460-ff4ed8f4683c?crop=entropy&cs=srgb&fm=jpg&q=80&w=300&h=300&fit=crop", "link": "/catalog?is_new=true"}, {"label_fr": "Promotions", "label_en": "Sale", "image_url": "https://images.unsplash.com/photo-1577212017184-80cc0da11082?crop=entropy&cs=srgb&fm=jpg&q=80&w=300&h=300&fit=crop", "link": "/catalog?on_sale=true"}, {"label_fr": "Entrainement", "label_en": "Training", "image_url": "https://images.unsplash.com/photo-1560272564-c83b66b1ad12?crop=entropy&cs=srgb&fm=jpg&q=80&w=300&h=300&fit=crop", "link": "/catalog?category=vetements&product_type=training"}, {"label_fr": "Personnalisation", "label_en": "Customization", "image_url": "https://images.unsplash.com/photo-1610736342326-b59eb016ba95?crop=entropy&cs=srgb&fm=jpg&q=80&w=300&h=300&fit=crop", "link": "/catalog?customizable=true"}], "columns": [{"title_fr": "Chaussures", "title_en": "Boots", "links": [{"label_fr": "Crampons terrain sec (FG)", "label_en": "Firm ground boots (FG)", "link": "/catalog?category=chaussures&surface=FG"}, {"label_fr": "Crampons synthetique (AG)", "label_en": "Artificial grass (AG)", "link": "/catalog?category=chaussures&surface=AG"}, {"label_fr": "Futsal & indoor", "label_en": "Futsal & indoor", "link": "/catalog?category=chaussures&surface=IC"}, {"label_fr": "Toutes les chaussures", "label_en": "All boots", "link": "/catalog?category=chaussures"}]}, {"title_fr": "Maillots", "title_en": "Jerseys", "links": [{"label_fr": "Maillots de clubs", "label_en": "Club jerseys", "link": "/catalog?category=maillots"}, {"label_fr": "Selections nationales", "label_en": "National teams", "link": "/catalog?category=maillots&product_type=national"}, {"label_fr": "Maillots personnalisables", "label_en": "Customizable jerseys", "link": "/catalog?customizable=true"}, {"label_fr": "Editions locales", "label_en": "Local editions", "link": "/brands"}]}, {"title_fr": "Equipements", "title_en": "Equipment", "links": [{"label_fr": "Ballons", "label_en": "Balls", "link": "/catalog?category=equipements"}, {"label_fr": "Protege-tibias", "label_en": "Shin guards", "link": "/catalog?category=equipements"}, {"label_fr": "Sacs de sport", "label_en": "Sports bags", "link": "/catalog?category=accessoires"}, {"label_fr": "Accessoires", "label_en": "Accessories", "link": "/catalog?category=accessoires"}]}, {"title_fr": "A la une", "title_en": "Trending", "links": [{"label_fr": "Nouveautes", "label_en": "New arrivals", "link": "/catalog?is_new=true"}, {"label_fr": "Meilleures ventes", "label_en": "Best sellers", "link": "/catalog?sort=best_sellers"}, {"label_fr": "Promotions", "label_en": "Sale", "link": "/catalog?on_sale=true"}, {"label_fr": "Toutes les marques", "label_en": "All brands", "link": "/brands"}]}]},
    "sections": {
        "categories": {"video_url": "https://assets.mixkit.co/videos/42355/42355-720.mp4", "image_url": "https://images.unsplash.com/photo-1575361204480-aadea25e6e68?crop=entropy&cs=srgb&fm=jpg&q=80&w=1800", "tagline_fr": "Tout l'univers du football", "tagline_en": "The whole football universe"},
        "new_arrivals": {"video_url": "", "image_url": "https://images.unsplash.com/photo-1540254597053-3901b858d40f?crop=entropy&cs=srgb&fm=jpg&q=80&w=1800", "tagline_fr": "Fraichement arrive en boutique", "tagline_en": "Just landed in store", "cards": [{"image_url": "https://images.unsplash.com/photo-1552066379-e7bfd22155c5?crop=entropy&cs=srgb&fm=jpg&q=80&w=1200", "video_url": "", "overline_fr": "Nouvelle collection", "overline_en": "New collection", "title_fr": "La saison commence ici", "title_en": "The season starts here", "cta_fr": "Acheter", "cta_en": "Shop", "cta_link": "/catalog?is_new=true", "cta2_fr": "En savoir plus", "cta2_en": "Learn more", "cta2_link": "/page/about"}, {"image_url": "https://images.unsplash.com/photo-1511886929837-354d827aae26?crop=entropy&cs=srgb&fm=jpg&q=80&w=1200", "video_url": "", "overline_fr": "Chaussures", "overline_en": "Boots", "title_fr": "Faites pour le terrain", "title_en": "Built for the pitch", "cta_fr": "Acheter", "cta_en": "Shop", "cta_link": "/catalog?category=chaussures", "cta2_fr": "", "cta2_en": "", "cta2_link": ""}]},
        "promotions": {"video_url": "", "image_url": "https://images.unsplash.com/photo-1614170059029-3b7422659b37?crop=entropy&cs=srgb&fm=jpg&q=80&w=1800", "tagline_fr": "Offres limitees sur une selection", "tagline_en": "Limited offers on selected gear", "cards": [{"image_url": "https://images.unsplash.com/photo-1614170059029-3b7422659b37?crop=entropy&cs=srgb&fm=jpg&q=80&w=1200", "video_url": "", "overline_fr": "Offres limitees", "overline_en": "Limited offers", "title_fr": "Jusqu'a -30% sur une selection", "title_en": "Up to 30% off selected gear", "cta_fr": "Acheter", "cta_en": "Shop", "cta_link": "/catalog?on_sale=true", "cta2_fr": "", "cta2_en": "", "cta2_link": ""}, {"image_url": "https://images.unsplash.com/photo-1540254597053-3901b858d40f?crop=entropy&cs=srgb&fm=jpg&q=80&w=1200", "video_url": "", "overline_fr": "Vetements", "overline_en": "Apparel", "title_fr": "Entrainez-vous avec style", "title_en": "Train in style", "cta_fr": "Acheter", "cta_en": "Shop", "cta_link": "/catalog?category=vetements", "cta2_fr": "", "cta2_en": "", "cta2_link": ""}]},
        "best_sellers": {"video_url": "", "image_url": "https://images.unsplash.com/photo-1552066379-e7bfd22155c5?crop=entropy&cs=srgb&fm=jpg&q=80&w=1800", "tagline_fr": "Les favoris de la communaute", "tagline_en": "Community favourites", "cards": [{"image_url": "https://images.unsplash.com/photo-1575361204480-aadea25e6e68?crop=entropy&cs=srgb&fm=jpg&q=80&w=1200", "video_url": "", "overline_fr": "Equipements", "overline_en": "Equipment", "title_fr": "Les indispensables du vestiaire", "title_en": "Locker-room essentials", "cta_fr": "Acheter", "cta_en": "Shop", "cta_link": "/catalog?category=equipements", "cta2_fr": "", "cta2_en": "", "cta2_link": ""}, {"image_url": "https://images.unsplash.com/photo-1552066379-e7bfd22155c5?crop=entropy&cs=srgb&fm=jpg&q=80&w=1200", "video_url": "", "overline_fr": "Maillots", "overline_en": "Jerseys", "title_fr": "Portez vos couleurs", "title_en": "Wear your colours", "cta_fr": "Acheter", "cta_en": "Shop", "cta_link": "/catalog?category=maillots", "cta2_fr": "En savoir plus", "cta2_en": "Learn more", "cta2_link": "/catalog?sort=best_sellers"}]},
        "featured": {"video_url": "", "image_url": "https://images.unsplash.com/photo-1511886929837-354d827aae26?crop=entropy&cs=srgb&fm=jpg&q=80&w=1800", "tagline_fr": "Choisis par l'equipe STRYKOS", "tagline_en": "Picked by the STRYKOS team", "cards": [{"image_url": "https://images.unsplash.com/photo-1511886929837-354d827aae26?crop=entropy&cs=srgb&fm=jpg&q=80&w=1200", "video_url": "", "overline_fr": "Selection STRYKOS", "overline_en": "STRYKOS picks", "title_fr": "Choisis pour la performance", "title_en": "Picked for performance", "cta_fr": "Acheter", "cta_en": "Shop", "cta_link": "/catalog", "cta2_fr": "", "cta2_en": "", "cta2_link": ""}, {"image_url": "https://images.unsplash.com/photo-1692506530242-c12d6c3ae2e2?crop=entropy&cs=srgb&fm=jpg&q=80&w=1200", "video_url": "", "overline_fr": "Accessoires", "overline_en": "Accessories", "title_fr": "Les details qui font la difference", "title_en": "Details that make the difference", "cta_fr": "Acheter", "cta_en": "Shop", "cta_link": "/catalog?category=accessoires", "cta2_fr": "", "cta2_en": "", "cta2_link": ""}]},
    },
    "taxonomies": {
        "genders": [
            {"value": "homme", "name_fr": "Homme", "name_en": "Men"},
            {"value": "femme", "name_fr": "Femme", "name_en": "Women"},
            {"value": "enfant", "name_fr": "Enfant", "name_en": "Kids"},
            {"value": "unisexe", "name_fr": "Unisexe", "name_en": "Unisex"},
        ],
        "sports": [
            {"value": "football", "name_fr": "Football", "name_en": "Football"},
            {"value": "running", "name_fr": "Running", "name_en": "Running"},
            {"value": "lifestyle", "name_fr": "Lifestyle", "name_en": "Lifestyle"},
            {"value": "fitness", "name_fr": "Fitness", "name_en": "Fitness"},
            {"value": "tennis", "name_fr": "Tennis", "name_en": "Tennis"},
            {"value": "basketball", "name_fr": "Basketball", "name_en": "Basketball"},
            {"value": "motorsport", "name_fr": "Motorsport", "name_en": "Motorsport"},
            {"value": "cyclisme", "name_fr": "Cyclisme", "name_en": "Cycling"},
        ],
    },
    "cart_reminders": {
        "enabled": True,
        "delay_1_hours": 4,             # 1er email apres 4h d'inactivite
        "delay_2_hours": 24,            # 2e email apres 24h
        "min_items": 1,                 # au moins 1 article
        "promo_on_second_email": True,  # code promo offert dans le 2e email
        "promo_code": "REVIENS5",       # code a envoyer
        "promo_discount_percent": 5,    # % de remise
    },
    "shipping": {
        "methods": [
            {"country": "ML", "country_name": "Mali", "name_fr": "Livraison standard Mali", "name_en": "Standard delivery Mali", "cost_eur": 5.0, "delay_fr": "3-6 jours ouvres", "delay_en": "3-6 business days"},
            {"country": "ML", "country_name": "Mali", "name_fr": "Livraison express Bamako", "name_en": "Express Bamako", "cost_eur": 9.0, "delay_fr": "1-2 jours ouvres", "delay_en": "1-2 business days"},
            {"country": "BE", "country_name": "Belgique", "name_fr": "Livraison standard Belgique", "name_en": "Standard delivery Belgium", "cost_eur": 4.5, "delay_fr": "2-4 jours ouvres", "delay_en": "2-4 business days"},
            {"country": "FR", "country_name": "France", "name_fr": "Livraison standard France", "name_en": "Standard delivery France", "cost_eur": 6.0, "delay_fr": "3-5 jours ouvres", "delay_en": "3-5 business days"},
        ],
        "origins": [
            {
                "country": "BE",
                "country_name": "Belgique",
                "name": "Depot Bruxelles",
                "address_line": "",
                "city": "Bruxelles",
                "postal_code": "",
                "phone": "+32 465743661",
                "email": "contact@actoos.com",
                "is_default": True,
                "carriers": ["bpost", "DHL", "UPS", "FedEx", "Colissimo", "Chronopost"],
            },
            {
                "country": "ML",
                "country_name": "Mali",
                "name": "Depot Bamako",
                "address_line": "",
                "city": "Bamako",
                "postal_code": "",
                "phone": "+223 00000000",
                "email": "contact@actoos.com",
                "is_default": True,
                "carriers": ["Coursier local", "Sendbox", "DHL Mali", "Autre"],
            },
        ],
    },
    "site": {
        "name": "STRYKOS",
        "brand_part1": "STRY",
        "brand_part2": "KOS",
        "brand_tagline": "Multimarque. Authentique. Livré chez vous.",
        "brand_tagline_en": "Multi-brand. Authentic. Delivered to you.",
        "email": "contact@actoos.com",
        "phone": "+32 465743661",
        "whatsapp": "+32465743661",
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
        "gender": getattr(product, "gender", "") or "",
        "sport": getattr(product, "sport", "") or "",
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


# ---------------- Transporteurs connus (liens de suivi auto) ----------------
CARRIER_URL_TEMPLATES = {
    "bpost": "https://tracking.bpost.be/{num}",
    "dhl": "https://www.dhl.com/global-en/home/tracking.html?tracking-id={num}",
    "dhl mali": "https://www.dhl.com/global-en/home/tracking.html?tracking-id={num}",
    "ups": "https://www.ups.com/track?tracknum={num}",
    "fedex": "https://www.fedex.com/fedextrack/?trknbr={num}",
    "colissimo": "https://www.laposte.fr/outils/suivre-vos-envois?code={num}",
    "chronopost": "https://www.chronopost.fr/tracking-no-cms/suivi-page?listeNumerosLT={num}",
    "sendbox": "https://sendbox.co/track?code={num}",
}


def carrier_url(carrier: str, tracking_number: str) -> str:
    """Genere un lien de suivi auto pour un transporteur connu (retourne '' sinon)."""
    if not carrier or not tracking_number:
        return ""
    key = carrier.strip().lower()
    tpl = CARRIER_URL_TEMPLATES.get(key)
    if not tpl:
        return ""
    return tpl.replace("{num}", tracking_number.strip())


def get_shipping_origins(settings: dict) -> list:
    """Retourne la liste des origines d'expedition (avec fallback vide)."""
    if not settings:
        return []
    return (settings.get("shipping", {}) or {}).get("origins", []) or []


def find_origin_for_country(settings: dict, country_code: str) -> dict | None:
    """Trouve l'origine d'expedition par defaut pour un pays."""
    origins = get_shipping_origins(settings)
    country_code = (country_code or "").upper()
    # Priorite : origin du pays marquee par defaut
    for o in origins:
        if (o.get("country") or "").upper() == country_code and o.get("is_default"):
            return o
    # Fallback : premiere origin du pays
    for o in origins:
        if (o.get("country") or "").upper() == country_code:
            return o
    # Fallback : premiere origin tout court (is_default global)
    for o in origins:
        if o.get("is_default"):
            return o
    return origins[0] if origins else None