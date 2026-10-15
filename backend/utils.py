import os
import random
import string
from datetime import datetime, timezone, date as date_cls
from sqlalchemy import select
from models import Setting

SUPPORTED_CURRENCIES = ["EUR", "USD", "XOF"]
STRIPE_SUPPORTED = {"EUR", "USD"}  # XOF settled in EUR for Stripe in v1

DEFAULT_RATES = {"EUR": 1.0, "USD": 1.08, "XOF": 655.957}
PUBLIC_BASE_URL = (os.environ.get("PUBLIC_BASE_URL") or os.environ.get("FRONTEND_URL", "")).rstrip("/")


def resolve_media(url):
    """Retourne l'URL finale vers le CDN Supabase si le chemin contient /api/media/.
    Gere tous les formats : relatif, absolu legacy (localhost, api.strykos.actoos.com)."""
    if not url:
        return ""
    url = url.strip()
    marker = "/api/media/"
    if marker in url:
        path = url[url.index(marker) + len(marker):]
        supabase = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
        bucket = os.environ.get("SUPABASE_MEDIA_BUCKET", "strykos-media")
        if supabase and path:
            return f"{supabase}/storage/v1/object/public/{bucket}/{path}"
    return url


def normalize_media(url):
    """Convertit une URL (absolue ou CDN Supabase) en chemin relatif /api/media/...
    pour un stockage DB portable."""
    if not url:
        return ""
    url = url.strip()
    marker = "/api/media/"
    if marker in url and "strykos/" in url:
        return url[url.index(marker):]
    supabase = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
    bucket = os.environ.get("SUPABASE_MEDIA_BUCKET", "strykos-media")
    if supabase:
        public_prefix = f"{supabase}/storage/v1/object/public/{bucket}/"
        if url.startswith(public_prefix):
            path = url[len(public_prefix):]
            return f"/api/media/{path}"
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
            "Pâtisserie artisanale - livraison internationale suivie",
            "Nouvelles créations chaque semaine",
        ],
        "messages_en": [
            "Artisan bakery - tracked worldwide delivery",
            "New creations every week",
        ],
    },
    "hero": {
        "interval_ms": 7000,
        "slides": [
            {"video_url": "", "image_url": "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=2000&q=85",
             "title_fr": "L'ART DU GÂTEAU SUR MESURE", "title_en": "THE ART OF CUSTOM CAKES",
             "subtitle_fr": "Gâteaux d'anniversaire, mariages et événements. Fait maison avec des ingrédients premium.",
             "subtitle_en": "Birthday, wedding and event cakes. Homemade with premium ingredients.",
             "cta_fr": "Découvrir nos gâteaux", "cta_en": "Shop now", "cta_link": "/catalog"},
            {"video_url": "", "image_url": "https://images.unsplash.com/photo-1535254973040-607b474cb50d?w=1800&q=80",
             "title_fr": "WEDDING CAKES D'EXCEPTION", "title_en": "EXCEPTIONAL WEDDING CAKES",
             "subtitle_fr": "Des pièces montées élégantes pour le plus beau jour de votre vie.",
             "subtitle_en": "Elegant tiered cakes for the most beautiful day of your life.",
             "cta_fr": "Voir les mariages", "cta_en": "See weddings", "cta_link": "/catalog?category=mariages"},
            {"video_url": "", "image_url": "https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=1800&q=80",
             "title_fr": "SAVEURS D'AFRIQUE", "title_en": "FLAVORS OF AFRICA",
             "subtitle_fr": "Mangue, bissap, coco : des créations originales aux saveurs authentiques.",
             "subtitle_en": "Mango, hibiscus, coconut: original creations with authentic flavors.",
             "cta_fr": "Découvrir", "cta_en": "Discover", "cta_link": "/catalog?category=evenements"},
        ],
    },
    "icons": {
        "title_fr": "NOS SPÉCIALITÉS",
        "title_en": "OUR SPECIALTIES",
        "items": [
            {"label_fr": "Anniversaires", "label_en": "Birthdays", "image_url": "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=300&h=300&fit=crop", "link": "/catalog?category=anniversaires"},
            {"label_fr": "Mariages", "label_en": "Weddings", "image_url": "https://images.unsplash.com/photo-1535254973040-607b474cb50d?w=300&h=300&fit=crop", "link": "/catalog?category=mariages"},
            {"label_fr": "Enfants", "label_en": "Kids", "image_url": "https://images.unsplash.com/photo-1426869884541-df7117556757?w=300&h=300&fit=crop", "link": "/catalog?category=enfants"},
            {"label_fr": "Personnalisés", "label_en": "Custom", "image_url": "https://images.unsplash.com/photo-1535141192574-5d4897c12636?w=300&h=300&fit=crop", "link": "/catalog?category=personnalises"},
            {"label_fr": "Événements", "label_en": "Events", "image_url": "https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=300&h=300&fit=crop", "link": "/catalog?category=evenements"},
            {"label_fr": "Cupcakes", "label_en": "Cupcakes", "image_url": "https://images.unsplash.com/photo-1614707267537-b85aaf00c4b7?w=300&h=300&fit=crop", "link": "/catalog?category=enfants"},
            {"label_fr": "Macarons", "label_en": "Macarons", "image_url": "https://images.unsplash.com/photo-1569864358642-9d1684040f43?w=300&h=300&fit=crop", "link": "/catalog?category=evenements"},
            {"label_fr": "Number cakes", "label_en": "Number cakes", "image_url": "https://images.unsplash.com/photo-1535141192574-5d4897c12636?w=300&h=300&fit=crop", "link": "/catalog?customizable=true"},
            {"label_fr": "Sans gluten", "label_en": "Gluten-free", "image_url": "https://images.unsplash.com/photo-1571115177098-24ec42ed204d?w=300&h=300&fit=crop", "link": "/catalog?sport=sans-gluten"},
            {"label_fr": "Vegan", "label_en": "Vegan", "image_url": "https://images.unsplash.com/photo-1587241321921-91a834d6d191?w=300&h=300&fit=crop", "link": "/catalog?sport=vegan"},
            {"label_fr": "Chocolat", "label_en": "Chocolate", "image_url": "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=300&h=300&fit=crop", "link": "/catalog?sport=chocolat"},
            {"label_fr": "Nouveautés", "label_en": "New arrivals", "image_url": "https://images.unsplash.com/photo-1616124619460-ff4ed8f4683c?w=300&h=300&fit=crop", "link": "/catalog?is_new=true"},
            {"label_fr": "Promotions", "label_en": "Sale", "image_url": "https://images.unsplash.com/photo-1577212017184-80cc0da11082?w=300&h=300&fit=crop", "link": "/catalog?on_sale=true"},
            {"label_fr": "Nos créations", "label_en": "Our creations", "image_url": "https://images.unsplash.com/photo-1587668178277-295251f900ce?w=300&h=300&fit=crop", "link": "/brands"},
            {"label_fr": "Occasions spéciales", "label_en": "Special occasions", "image_url": "https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?w=300&h=300&fit=crop", "link": "/catalog?category=evenements"},
            {"label_fr": "Personnalisation", "label_en": "Customization", "image_url": "https://images.unsplash.com/photo-1610736342326-b59eb016ba95?w=300&h=300&fit=crop", "link": "/catalog?customizable=true"}
        ],
        "columns": [
            {"title_fr": "Par occasion", "title_en": "By occasion", "links": [
                {"label_fr": "Anniversaires", "label_en": "Birthdays", "link": "/catalog?category=anniversaires"},
                {"label_fr": "Mariages", "label_en": "Weddings", "link": "/catalog?category=mariages"},
                {"label_fr": "Baby shower", "label_en": "Baby shower", "link": "/catalog?gender=baby-shower"},
                {"label_fr": "Baptême", "label_en": "Christening", "link": "/catalog?gender=bapteme"},
                {"label_fr": "Entreprise", "label_en": "Corporate", "link": "/catalog?gender=entreprise"}
            ]},
            {"title_fr": "Par saveur", "title_en": "By flavor", "links": [
                {"label_fr": "Chocolat", "label_en": "Chocolate", "link": "/catalog?sport=chocolat"},
                {"label_fr": "Fruits", "label_en": "Fruits", "link": "/catalog?sport=fruits"},
                {"label_fr": "Classique", "label_en": "Classic", "link": "/catalog?sport=classique"},
                {"label_fr": "Sans gluten", "label_en": "Gluten-free", "link": "/catalog?sport=sans-gluten"},
                {"label_fr": "Vegan", "label_en": "Vegan", "link": "/catalog?sport=vegan"}
            ]},
            {"title_fr": "Nos créations", "title_en": "Our creations", "links": [
                {"label_fr": "Pâtisserie du Chef", "label_en": "Pâtisserie du Chef", "link": "/catalog?brand=patisserie-du-chef"},
                {"label_fr": "Sweet Lab", "label_en": "Sweet Lab", "link": "/catalog?brand=sweet-lab"},
                {"label_fr": "Maison Sucré", "label_en": "Maison Sucré", "link": "/catalog?brand=maison-sucre"},
                {"label_fr": "Toutes les créations", "label_en": "All creations", "link": "/brands"}
            ]},
            {"title_fr": "À la une", "title_en": "Trending", "links": [
                {"label_fr": "Nouveautés", "label_en": "New arrivals", "link": "/catalog?is_new=true"},
                {"label_fr": "Meilleures ventes", "label_en": "Best sellers", "link": "/catalog?sort=best_sellers"},
                {"label_fr": "Promotions", "label_en": "Sale", "link": "/catalog?on_sale=true"},
                {"label_fr": "Personnalisables", "label_en": "Customizable", "link": "/catalog?customizable=true"}
            ]}
        ]
    },
    "sections": {
        "categories": {"video_url": "", "image_url": "https://images.unsplash.com/photo-1519869325930-281384150729?w=1800&q=80", "tagline_fr": "L'univers de la pâtisserie artisanale", "tagline_en": "The artisan bakery universe"},
        "new_arrivals": {"video_url": "", "image_url": "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=1800&q=80", "tagline_fr": "Fraîchement sorti du four", "tagline_en": "Fresh out of the oven", "cards": [
            {"image_url": "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=1200&q=80", "video_url": "", "overline_fr": "Nouvelles créations", "overline_en": "New creations", "title_fr": "Nos gâteaux du moment", "title_en": "Our cakes of the moment", "cta_fr": "Découvrir", "cta_en": "Discover", "cta_link": "/catalog?is_new=true", "cta2_fr": "En savoir plus", "cta2_en": "Learn more", "cta2_link": "/page/about"},
            {"image_url": "https://images.unsplash.com/photo-1535254973040-607b474cb50d?w=1200&q=80", "video_url": "", "overline_fr": "Mariages", "overline_en": "Weddings", "title_fr": "Le gâteau parfait", "title_en": "The perfect cake", "cta_fr": "Découvrir", "cta_en": "Discover", "cta_link": "/catalog?category=mariages", "cta2_fr": "", "cta2_en": "", "cta2_link": ""}
        ]},
        "promotions": {"video_url": "", "image_url": "https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=1800&q=80", "tagline_fr": "Offres limitées sur une sélection", "tagline_en": "Limited offers on selected items", "cards": [
            {"image_url": "https://images.unsplash.com/photo-1614707267537-b85aaf00c4b7?w=1200&q=80", "video_url": "", "overline_fr": "Offres limitées", "overline_en": "Limited offers", "title_fr": "Jusqu'à -30% sur une sélection", "title_en": "Up to 30% off selected items", "cta_fr": "Découvrir", "cta_en": "Discover", "cta_link": "/catalog?on_sale=true", "cta2_fr": "", "cta2_en": "", "cta2_link": ""},
            {"image_url": "https://images.unsplash.com/photo-1426869884541-df7117556757?w=1200&q=80", "video_url": "", "overline_fr": "Enfants", "overline_en": "Kids", "title_fr": "Anniversaires inoubliables", "title_en": "Unforgettable birthdays", "cta_fr": "Découvrir", "cta_en": "Discover", "cta_link": "/catalog?category=enfants", "cta2_fr": "", "cta2_en": "", "cta2_link": ""}
        ]},
        "best_sellers": {"video_url": "", "image_url": "https://images.unsplash.com/photo-1569864358642-9d1684040f43?w=1800&q=80", "tagline_fr": "Les favoris de nos clients", "tagline_en": "Our customers' favourites", "cards": [
            {"image_url": "https://images.unsplash.com/photo-1569864358642-9d1684040f43?w=1200&q=80", "video_url": "", "overline_fr": "Macarons", "overline_en": "Macarons", "title_fr": "L'incontournable français", "title_en": "The French classic", "cta_fr": "Découvrir", "cta_en": "Discover", "cta_link": "/catalog?category=evenements", "cta2_fr": "", "cta2_en": "", "cta2_link": ""},
            {"image_url": "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=1200&q=80", "video_url": "", "overline_fr": "Chocolat", "overline_en": "Chocolate", "title_fr": "Pour les amateurs de chocolat", "title_en": "For chocolate lovers", "cta_fr": "Découvrir", "cta_en": "Discover", "cta_link": "/catalog?sport=chocolat", "cta2_fr": "Voir tous", "cta2_en": "See all", "cta2_link": "/catalog?sort=best_sellers"}
        ]},
        "featured": {"video_url": "", "image_url": "https://images.unsplash.com/photo-1535141192574-5d4897c12636?w=1800&q=80", "tagline_fr": "Choisis par notre équipe", "tagline_en": "Picked by our team", "cards": [
            {"image_url": "https://images.unsplash.com/photo-1535141192574-5d4897c12636?w=1200&q=80", "video_url": "", "overline_fr": "Number cakes", "overline_en": "Number cakes", "title_fr": "Personnalisez votre gâteau", "title_en": "Customize your cake", "cta_fr": "Personnaliser", "cta_en": "Customize", "cta_link": "/catalog?customizable=true", "cta2_fr": "", "cta2_en": "", "cta2_link": ""},
            {"image_url": "https://images.unsplash.com/photo-1587241321921-91a834d6d191?w=1200&q=80", "video_url": "", "overline_fr": "Vegan", "overline_en": "Vegan", "title_fr": "Gourmand sans compromis", "title_en": "Indulgent without compromise", "cta_fr": "Découvrir", "cta_en": "Discover", "cta_link": "/catalog?sport=vegan", "cta2_fr": "", "cta2_en": "", "cta2_link": ""}
        ]},
        "editorial": {"image_url": "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=1800&q=80", "title_fr": "L'ART DU GÂTEAU SUR MESURE", "title_en": "THE ART OF CUSTOM CAKES", "subtitle_fr": "Gâteaux d'anniversaire, mariages et événements. Fait maison avec des ingrédients premium.", "subtitle_en": "Birthday, wedding and event cakes. Homemade with premium ingredients.", "cta_fr": "Découvrir nos gâteaux", "cta_en": "Shop now", "cta_link": "/catalog"},
    },
    "taxonomies": {
        "genders": [
            {"value": "anniversaire", "name_fr": "Anniversaire", "name_en": "Birthday", "image_url": ""},
            {"value": "mariage", "name_fr": "Mariage", "name_en": "Wedding", "image_url": ""},
            {"value": "baby-shower", "name_fr": "Baby shower", "name_en": "Baby shower", "image_url": ""},
            {"value": "bapteme", "name_fr": "Baptême", "name_en": "Christening", "image_url": ""},
            {"value": "entreprise", "name_fr": "Entreprise", "name_en": "Corporate", "image_url": ""},
        ],
        "sports": [
            {"value": "classique", "name_fr": "Classique", "name_en": "Classic", "image_url": ""},
            {"value": "chocolat", "name_fr": "Chocolat", "name_en": "Chocolate", "image_url": ""},
            {"value": "fruits", "name_fr": "Fruits", "name_en": "Fruits", "image_url": ""},
            {"value": "sans-gluten", "name_fr": "Sans gluten", "name_en": "Gluten-free", "image_url": ""},
            {"value": "vegan", "name_fr": "Vegan", "name_en": "Vegan", "image_url": ""},
            {"value": "sans-lactose", "name_fr": "Sans lactose", "name_en": "Lactose-free", "image_url": ""},
        ],
        "teams": [],
        "clubs": [],
    },
    "orders": {
        "min_lead_hours": 48,
        "max_advance_days": 180,
        "time_slots": [
            {"value": "matin",      "label_fr": "Matin (9h-12h)",       "label_en": "Morning (9am-12pm)"},
            {"value": "apres-midi", "label_fr": "Après-midi (14h-18h)", "label_en": "Afternoon (2pm-6pm)"},
            {"value": "soir",       "label_fr": "Soirée (18h-20h)",     "label_en": "Evening (6pm-8pm)"},
        ],
        "weekly_closed_days": [],
        "closed_dates": [],
        "closed_ranges": [],
        "special_days": [],
        # ⭐ NOUVEAU : réclamations
        "claim_window_hours": 48,           # Délai pour signaler un problème (heures)
        "claim_media_max_photos": 3,        # Nombre max de photos
        "claim_media_max_videos": 1,        # Nombre max de vidéos
        "claim_media_max_photo_mb": 5,      # Taille max photo (Mo)
        "claim_media_max_video_mb": 50,     # Taille max vidéo (Mo)
    },
    "features": {
        "items": [
            {"icon": "truck", "title_fr": "Livraison rapide", "title_en": "Fast delivery",
             "subtitle_fr": "À Bamako et environs", "subtitle_en": "In Bamako and nearby"},
            {"icon": "shield", "title_fr": "Paiement sécurisé", "title_en": "Secure payment",
             "subtitle_fr": "Orange Money, Wave, CinetPay", "subtitle_en": "Orange Money, Wave, CinetPay"},
            {"icon": "store", "title_fr": "Retrait en boutique", "title_en": "In-store pickup",
             "subtitle_fr": "Sur rendez-vous", "subtitle_en": "By appointment"},
            {"icon": "headphones", "title_fr": "Service client", "title_en": "Customer service",
             "subtitle_fr": "Disponible 7j/7", "subtitle_en": "Available 7/7"},
        ]
    },
    "testimonials": {
        "title_fr": "Ils nous font confiance",
        "title_en": "They trust us",
        "items": [
            {"name": "Aminata Traoré", "rating": 5, "avatar": "",
             "text_fr": "Le gâteau était magnifique et délicieux ! Tout le monde a adoré. Merci pour votre professionnalisme.",
             "text_en": "The cake was gorgeous and delicious! Everyone loved it. Thank you for your professionalism."},
            {"name": "Moussa Diallo", "rating": 5, "avatar": "",
             "text_fr": "Commande facile, livraison à l'heure. Le gâteau était encore plus beau que sur la photo.",
             "text_en": "Easy ordering, on-time delivery. The cake was even more beautiful than in the photo."},
            {"name": "Fatoumata Keita", "rating": 5, "avatar": "",
             "text_fr": "Un vrai plaisir de travailler avec vous. Je recommande à 100%.",
             "text_en": "A real pleasure to work with you. I recommend 100%."},
        ]
    },
    "cart_reminders": {
        "enabled": True,
        "delay_1_hours": 4,
        "delay_2_hours": 24,
        "min_items": 1,
        "promo_on_second_email": True,
        "promo_code": "REVIENS5",
        "promo_discount_percent": 5,
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
                "country": "BE", "country_name": "Belgique", "name": "Depot Bruxelles",
                "address_line": "", "city": "Bruxelles", "postal_code": "",
                "phone": "+32 465743661", "email": "contact@actoos.com",
                "is_default": True,
                "carriers": ["bpost", "DHL", "UPS", "FedEx", "Colissimo", "Chronopost"],
            },
            {
                "country": "ML", "country_name": "Mali", "name": "Depot Bamako",
                "address_line": "", "city": "Bamako", "postal_code": "",
                "phone": "+223 00000000", "email": "contact@actoos.com",
                "is_default": True,
                "carriers": ["Coursier local", "Sendbox", "DHL Mali", "Autre"],
            },
        ],
    },
    "site": {
        "name": "Cakes Shop",
        "brand_part1": "CAKES",
        "brand_part2": "SHOP",
        "brand_tagline": "Gâteaux artisanaux. Livrés chez vous.",
        "brand_tagline_en": "Artisan cakes. Delivered to you.",
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


def _sizes_from_variants(product):
    """
    Retourne la liste unique des tailles/portions pour un produit.
    Trie : numérique croissant ("4 parts" < "8 parts" < "12 parts" < "x6" < "x12").
    """
    seen = set()
    for v in (product.variants or []):
        s = (getattr(v, "size", "") or "").strip()
        if s:
            seen.add(s)

    def _key(s):
        # Extrait le premier nombre trouvé
        num = ""
        for ch in s:
            if ch.isdigit():
                num += ch
            elif num:
                break
        if num:
            return (0, int(num), s.lower())
        return (1, 0, s.lower())

    return sorted(seen, key=_key)


# ---------------- Personnalisation produit ----------------
def customization_price_eur(product, customization: dict) -> float:
    """
    Calcule le surcoût en EUR d'une personnalisation.
    - Si le produit a des `customization_fields`, somme le prix des champs non vides.
    - Sinon, retombe sur l'ancien `customization_price_eur` global (si non nul).
    """
    fields = product.customization_fields or []
    if not fields:
        # Fallback ancien système
        if customization and float(product.customization_price_eur or 0) > 0:
            return float(product.customization_price_eur or 0)
        return 0.0

    total = 0.0
    for f in fields:
        key = f.get("key")
        if not key:
            continue
        val = (customization or {}).get(key)
        if val is None or str(val).strip() == "":
            continue
        total += float(f.get("price_eur") or 0)
    return round(total, 2)


def validate_customization(product, customization: dict) -> None:
    """
    Valide la personnalisation selon les `customization_fields` du produit.
    Raise ValueError avec un message clair si invalide.
    """
    fields = product.customization_fields or []
    if not fields:
        return  # rien à valider (ancien système)
    if not customization:
        customization = {}

    for f in fields:
        key = f.get("key")
        if not key:
            continue
        label = f.get("label_fr") or f.get("label_en") or key
        val = customization.get(key, "")
        is_empty = val is None or str(val).strip() == ""

        # 1) Obligatoire
        if f.get("required") and is_empty:
            raise ValueError(f"Le champ « {label} » est obligatoire")

        if is_empty:
            continue

        typ = f.get("type") or "text"

        # 2) Texte court / long
        if typ in ("text", "textarea"):
            max_len = int(f.get("max_length") or 200)
            if len(str(val)) > max_len:
                raise ValueError(f"« {label} » ne doit pas dépasser {max_len} caractères")

        # 3) Nombre
        elif typ == "number":
            try:
                float(val)
            except (TypeError, ValueError):
                raise ValueError(f"« {label} » doit être un nombre")

        # 4) Date
        elif typ == "date":
            try:
                datetime.strptime(str(val), "%Y-%m-%d")
            except ValueError:
                raise ValueError(f"« {label} » doit être une date valide (AAAA-MM-JJ)")

        # 5) Choix unique
        elif typ == "select":
            allowed = {o.get("value") for o in (f.get("options") or []) if o}
            if str(val) not in allowed:
                raise ValueError(f"Valeur invalide pour « {label} »")


def customization_summary(product, customization: dict, lang: str = "fr") -> str:
    """Retourne un résumé lisible de la personnalisation (pour emails / admin)."""
    fields = product.customization_fields or []
    if not fields:
        return ""
    parts = []
    for f in fields:
        key = f.get("key")
        val = (customization or {}).get(key)
        if val is None or str(val).strip() == "":
            continue
        label = f.get(f"label_{lang}") or f.get("label_fr") or key
        # Pour select, on cherche le label affiché
        if (f.get("type") or "") == "select":
            opts = f.get("options") or []
            opt = next((o for o in opts if o.get("value") == val), None)
            if opt:
                val = opt.get(f"label_{lang}") or opt.get("label_fr") or val
        parts.append(f"{label} : {val}")
    return " · ".join(parts)


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
        # ⭐ Champs de personnalisation configurables
        "customization_fields": product.customization_fields or [],
        # ⭐ NOUVEAU : texte du bouton sur la home (vide = auto)
        "cta_label": product.cta_label or "",
        "images": [resolve_media(img.url) for img in product.images] if product.images else [],
        "video_url": resolve_media(product.video_url),
        "published": product.published,
        # ⭐ Liste des tailles/portions pour filtres dynamiques
        "sizes": _sizes_from_variants(product),
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
        # ⭐ Prix max de personnalisation (base + tous les champs)
        data["customization_total_price_eur"] = float(product.customization_price_eur or 0) + sum(
            float(f.get("price_eur") or 0) for f in (product.customization_fields or [])
        )
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
    for o in origins:
        if (o.get("country") or "").upper() == country_code and o.get("is_default"):
            return o
    for o in origins:
        if (o.get("country") or "").upper() == country_code:
            return o
    for o in origins:
        if o.get("is_default"):
            return o
    return origins[0] if origins else None


# ---------------- Jours de fermeture / créneaux disponibles ----------------
def get_available_slots_for_date(target_date: date_cls, orders_cfg: dict) -> tuple:
    """
    Retourne (available, slots, reason_fr, reason_en) pour une date donnée.

    - available : bool
    - slots : liste de créneaux dispo (les custom du jour spécial, sinon les défauts)
    - reason_fr/en : raison du blocage si non disponible

    Ordre de vérification :
    1. Jour de fermeture hebdomadaire (weekly_closed_days)
    2. Date fermée spécifique (closed_dates)
    3. Période de fermeture (closed_ranges)
    4. Jour spécial (special_days) → créneaux custom ou fermeture
    5. Sinon : créneaux par défaut (time_slots)
    """
    if not orders_cfg:
        return True, [], "", ""

    # 1) Vérifier jour de fermeture hebdomadaire
    weekday = target_date.weekday()  # 0=lundi...6=dimanche
    py_to_custom = {6: 0, 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6}
    custom_weekday = py_to_custom[weekday]

    if custom_weekday in (orders_cfg.get("weekly_closed_days") or []):
        return False, [], "Fermé ce jour-là (jour de repos hebdomadaire)", "Closed on this day (weekly day off)"

    # 2) Vérifier date fermée spécifique
    date_str = target_date.isoformat()
    if date_str in (orders_cfg.get("closed_dates") or []):
        return False, [], "Fermé à cette date (jour férié)", "Closed on this date (holiday)"

    # 3) Vérifier période de fermeture
    for r in (orders_cfg.get("closed_ranges") or []):
        start = r.get("start", "")
        end = r.get("end", "")
        if start and end and start <= date_str <= end:
            return (
                False, [],
                r.get("reason_fr") or "Fermé (période de congés)",
                r.get("reason_en") or "Closed (holiday period)"
            )

    # 4) Vérifier jour spécial (horaires custom)
    for sp in (orders_cfg.get("special_days") or []):
        if sp.get("date") == date_str:
            slots = sp.get("time_slots") or []
            if not slots:
                return (
                    False, [],
                    sp.get("reason_fr") or "Fermé (jour spécial)",
                    sp.get("reason_en") or "Closed (special day)"
                )
            return True, slots, sp.get("reason_fr", ""), sp.get("reason_en", "")

    # 5) Sinon : créneaux par défaut
    default_slots = orders_cfg.get("time_slots") or []
    return True, default_slots, "", ""


def is_date_closed(target_date: date_cls, orders_cfg: dict) -> tuple:
    """Retourne (is_closed, reason_fr, reason_en)."""
    ok, _, r_fr, r_en = get_available_slots_for_date(target_date, orders_cfg)
    return (not ok), r_fr, r_en