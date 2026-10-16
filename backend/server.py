from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / '.env')

import os
import logging
from fastapi import FastAPI, APIRouter, Depends, Request
from starlette.middleware.cors import CORSMiddleware
from sqlalchemy import select

from database import get_db, AsyncSessionLocal
from models import Profile, Setting
from auth import hash_password, verify_password
from utils import DEFAULT_SETTINGS

from routers.auth_router import router as auth_router
from routers.catalog_router import router as catalog_router
from routers.commerce_router import router as commerce_router
from routers.admin_router import router as admin_router
from routers.settings_router import router as settings_router
from routers.media_router import router as media_router
from routers.reviews_router import router as reviews_router
from routers.newsletter_router import router as newsletter_router
from routers.contact_router import router as contact_router
from routers.sitemap_router import router as sitemap_router
from routers.cart_router import router as cart_router
# ⭐ NOUVEAU : router livreur
from routers.driver_router import router as driver_router
from storage import init_storage
from routers.cron_router import router as cron_router
from sqlalchemy.ext.asyncio import AsyncSession          # ⭐ AJOUT

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("strykos")

app = FastAPI(title="CAKESSHOP API")
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "CAKESSHOP API", "status": "ok"}


# ⭐ NOUVEAU : endpoint health dédié aux monitors (UptimeRobot, etc.)
# Accepte GET ET HEAD pour compatibilité totale
@api_router.api_route("/health", methods=["GET", "HEAD"])
async def health():
    return {"status": "ok", "service": "cakes-api"}


# ⭐ NOUVEAU : endpoint version pour invalidation intelligente du cache
@api_router.get("/version")
async def public_version(db: AsyncSession = Depends(get_db)):
    """
    Retourne la version globale du cache.
    Jamais mise en cache côté navigateur → toujours fraîche.
    """
    from utils import get_cache_version
    from fastapi.responses import JSONResponse
    v = await get_cache_version(db)
    return JSONResponse(
        content={"v": v},
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


api_router.include_router(auth_router)
api_router.include_router(catalog_router)
api_router.include_router(commerce_router)
api_router.include_router(admin_router)
api_router.include_router(settings_router)
api_router.include_router(media_router)
api_router.include_router(reviews_router)
api_router.include_router(newsletter_router)
api_router.include_router(contact_router)
api_router.include_router(sitemap_router)
api_router.include_router(cart_router)
api_router.include_router(cron_router)
# ⭐ NOUVEAU : routes livreur → /api/driver/...
api_router.include_router(driver_router)
app.include_router(api_router)


PUBLIC_CACHE_PREFIXES = ("/api/settings", "/api/home", "/api/products", "/api/categories", "/api/brands", "/api/search")


@app.middleware("http")
async def public_cache_headers(request: Request, call_next):
    response = await call_next(request)
    if (request.method == "GET" and request.url.path.startswith(PUBLIC_CACHE_PREFIXES)
            and "authorization" not in request.headers and response.status_code == 200
            and "/reviews" not in request.url.path):
        response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=600"
    return response


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
)


# ---------------- Seed demo (categories + brands + products) ----------------
async def _seed_demo_data(db):
    """Cree categories + marques + produits de demo si la base est vide.
    Idempotent : skip si deja rempli. Permet un reset propre."""
    from models import Category, Brand, Product, ProductVariant, ProductImage
    from sqlalchemy import func as _f

    # ==================== 1) CATEGORIES ====================
    cat_count = (await db.execute(select(_f.count(Category.id)))).scalar() or 0
    if cat_count == 0:
        # Categories meres
        PARENTS = [
            {"slug": "anniversaires", "name_fr": "Anniversaires", "name_en": "Birthdays", "type": "anniversaires", "position": 1},
            {"slug": "mariages", "name_fr": "Mariages", "name_en": "Weddings", "type": "mariages", "position": 2},
            {"slug": "enfants", "name_fr": "Enfants", "name_en": "Kids", "type": "enfants", "position": 3},
            {"slug": "personnalises", "name_fr": "Personnalisés", "name_en": "Custom", "type": "personnalises", "position": 4},
            {"slug": "evenements", "name_fr": "Événements", "name_en": "Events", "type": "evenements", "position": 5},
        ]
        parent_map = {}
        for c in PARENTS:
            cat = Category(**c)
            db.add(cat)
            await db.flush()
            parent_map[c["slug"]] = cat.id

        # Sous-categories
        CHILDREN = [
            {"slug": "gateaux-adultes", "name_fr": "Gâteaux adultes", "name_en": "Adult cakes", "parent": "anniversaires", "position": 11},
            {"slug": "gateaux-enfants", "name_fr": "Gâteaux enfants", "name_en": "Kids cakes", "parent": "anniversaires", "position": 12},
            {"slug": "number-cakes", "name_fr": "Number cakes", "name_en": "Number cakes", "parent": "anniversaires", "position": 13},
            {"slug": "wedding-cakes-2-etages", "name_fr": "Wedding cakes 2 étages", "name_en": "2-tier wedding cakes", "parent": "mariages", "position": 21},
            {"slug": "wedding-cakes-3-etages", "name_fr": "Wedding cakes 3 étages", "name_en": "3-tier wedding cakes", "parent": "mariages", "position": 22},
            {"slug": "pieces-montees", "name_fr": "Pièces montées", "name_en": "Tiered cakes", "parent": "mariages", "position": 23},
            {"slug": "gateaux-thematiques", "name_fr": "Gâteaux thématiques", "name_en": "Themed cakes", "parent": "enfants", "position": 31},
            {"slug": "cupcakes-enfants", "name_fr": "Cupcakes enfants", "name_en": "Kids cupcakes", "parent": "enfants", "position": 32},
            {"slug": "gateaux-photo", "name_fr": "Gâteaux photo", "name_en": "Photo cakes", "parent": "personnalises", "position": 41},
            {"slug": "message-sur-mesure", "name_fr": "Message sur mesure", "name_en": "Custom message", "parent": "personnalises", "position": 42},
            {"slug": "macarons", "name_fr": "Macarons", "name_en": "Macarons", "parent": "evenements", "position": 51},
            {"slug": "buffets-sucres", "name_fr": "Buffets sucrés", "name_en": "Sweet buffets", "parent": "evenements", "position": 52},
        ]
        for c in CHILDREN:
            parent_slug = c.pop("parent")
            cat = Category(**c, parent_id=parent_map[parent_slug])
            db.add(cat)
        await db.flush()
        logger.info(f"Seeded {len(PARENTS)} parent categories + {len(CHILDREN)} subcategories")

    # ==================== 2) MARQUES ====================
    brand_count = (await db.execute(select(_f.count(Brand.id)))).scalar() or 0
    if brand_count == 0:
        BRANDS = [
            {"name": "Pâtisserie du Chef", "slug": "patisserie-du-chef", "is_local": False, "description_fr": "Créations haut de gamme signées par notre chef pâtissier."},
            {"name": "Sweet Lab", "slug": "sweet-lab", "is_local": False, "description_fr": "Le labo des gourmandises modernes et colorées."},
            {"name": "Maison Sucré", "slug": "maison-sucre", "is_local": False, "description_fr": "Recettes traditionnelles françaises revisitées."},
            {"name": "Les Délices", "slug": "les-delices", "is_local": False, "description_fr": "Macarons et mignardises d'exception."},
            {"name": "Atelier Gâteau", "slug": "atelier-gateau", "is_local": True, "description_fr": "Atelier local spécialisé dans le cake design sur mesure."},
            {"name": "Saveurs d'Afrique", "slug": "saveurs-afrique", "is_local": True, "description_fr": "Saveurs authentiques d'Afrique de l'Ouest (mangue, bissap, coco)."},
        ]
        for b in BRANDS:
            db.add(Brand(**b))
        await db.flush()
        logger.info(f"Seeded {len(BRANDS)} brands")

    # ==================== 3) PRODUITS ====================
    prod_count = (await db.execute(select(_f.count(Product.id)))).scalar() or 0
    if prod_count == 0:
        cats = {c.slug: c.id for c in (await db.execute(select(Category))).scalars().all()}
        brands = {b.slug: b.id for b in (await db.execute(select(Brand))).scalars().all()}

        DEMO = [
            # --- Anniversaires ---
            {
                "slug": "gateau-anniversaire-chocolat",
                "name_fr": "Gâteau d'anniversaire chocolat noir",
                "name_en": "Dark chocolate birthday cake",
                "description_fr": "Génoise moelleuse au chocolat noir, ganache intense et décor chocolaté. Personnalisable avec un message.",
                "description_en": "Moist dark chocolate sponge, rich ganache and chocolate decoration. Customizable with a message.",
                "price_eur": 34.90, "category": "gateaux-adultes", "brand": "patisserie-du-chef",
                "gender": "anniversaire", "sport": "chocolat", "product_type": "gâteau",
                "is_new": True, "is_featured": True, "is_best_seller": True, "customizable": True,
                "images": [
                    "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=800&q=80",
                    "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=800&q=80",
                ],
            },
            {
                "slug": "gateau-fraise-gourmande",
                "name_fr": "Fraise Gourmande",
                "name_en": "Strawberry Delight",
                "description_fr": "Génoise vanille, crème pâtissière à la vanille de Madagascar et fraises fraîches.",
                "description_en": "Vanilla sponge, Madagascar vanilla pastry cream and fresh strawberries.",
                "price_eur": 32.00, "category": "gateaux-adultes", "brand": "maison-sucre",
                "gender": "anniversaire", "sport": "fruits", "product_type": "gâteau",
                "is_best_seller": True,
                "images": [
                    "https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=800&q=80",
                    "https://images.unsplash.com/photo-1571115177098-24ec42ed204d?w=800&q=80",
                ],
            },
            {
                "slug": "number-cake-personnalise",
                "name_fr": "Number cake personnalisé",
                "name_en": "Custom number cake",
                "description_fr": "Chiffre de votre choix, garniture au choix : chocolat, vanille, fruits. Idéal pour un anniversaire mémorable.",
                "description_en": "Number of your choice, filling of your choice: chocolate, vanilla, fruits. Perfect for a memorable birthday.",
                "price_eur": 45.00, "category": "number-cakes", "brand": "atelier-gateau",
                "gender": "anniversaire", "sport": "classique", "product_type": "number-cake",
                "is_new": True, "customizable": True,
                "images": [
                    "https://images.unsplash.com/photo-1535141192574-5d4897c12636?w=800&q=80",
                    "https://images.unsplash.com/photo-1621303837174-89787a7d4729?w=800&q=80",
                ],
            },
            {
                "slug": "gateau-anniversaire-enfant-theme",
                "name_fr": "Gâteau anniversaire enfant (thème)",
                "name_en": "Kids birthday cake (themed)",
                "description_fr": "Gâteau coloré sur un thème au choix : licorne, super-héros, animaux, princesse...",
                "description_en": "Colorful cake on a theme of your choice: unicorn, superhero, animals, princess...",
                "price_eur": 38.00, "category": "gateaux-thematiques", "brand": "sweet-lab",
                "gender": "anniversaire", "sport": "classique", "product_type": "gâteau",
                "is_best_seller": True, "customizable": True,
                "images": [
                    "https://images.unsplash.com/photo-1614707267537-b85aaf00c4b7?w=800&q=80",
                    "https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?w=800&q=80",
                ],
            },

            # --- Mariages ---
            {
                "slug": "wedding-cake-3-etages-classique",
                "name_fr": "Wedding cake 3 étages classique",
                "name_en": "Classic 3-tier wedding cake",
                "description_fr": "Pièce montée élégante à la vanille et fruits rouges, décor floral délicat.",
                "description_en": "Elegant vanilla and red berries tiered cake, delicate floral decoration.",
                "price_eur": 189.00, "category": "wedding-cakes-3-etages", "brand": "maison-sucre",
                "gender": "mariage", "sport": "fruits", "product_type": "wedding-cake",
                "is_featured": True, "is_best_seller": True,
                "images": [
                    "https://images.unsplash.com/photo-1535254973040-607b474cb50d?w=800&q=80",
                    "https://images.unsplash.com/photo-1587241321921-91a834d6d191?w=800&q=80",
                ],
            },
            {
                "slug": "wedding-cake-2-etages",
                "name_fr": "Wedding cake 2 étages",
                "name_en": "2-tier wedding cake",
                "description_fr": "Gâteau de mariage à 2 étages, idéal pour les cérémonies intimes.",
                "description_en": "Two-tier wedding cake, ideal for intimate ceremonies.",
                "price_eur": 129.00, "category": "wedding-cakes-2-etages", "brand": "patisserie-du-chef",
                "gender": "mariage", "sport": "classique", "product_type": "wedding-cake",
                "images": ["https://images.unsplash.com/photo-1535141192574-5d4897c12636?w=800&q=80"],
            },
            {
                "slug": "piece-montee-chocolat-caramel",
                "name_fr": "Pièce montée chocolat-caramel",
                "name_en": "Chocolate-caramel tiered cake",
                "description_fr": "Pièce montée généreuse au chocolat noir et caramel beurre salé.",
                "description_en": "Generous tiered cake with dark chocolate and salted butter caramel.",
                "price_eur": 165.00, "category": "pieces-montees", "brand": "les-delices",
                "gender": "mariage", "sport": "chocolat", "product_type": "wedding-cake",
                "images": ["https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=800&q=80"],
            },

            # --- Enfants ---
            {
                "slug": "cupcakes-enfants-x12",
                "name_fr": "Cupcakes enfants (x12)",
                "name_en": "Kids cupcakes (x12)",
                "description_fr": "Douze cupcakes colorés, parfaits pour les goûters d'anniversaire. Personnalisation possible.",
                "description_en": "Twelve colorful cupcakes, perfect for birthday parties. Customizable.",
                "price_eur": 24.50, "category": "cupcakes-enfants", "brand": "sweet-lab",
                "gender": "anniversaire", "sport": "classique", "product_type": "cupcake",
                "is_new": True, "customizable": True,
                "images": ["https://images.unsplash.com/photo-1426869884541-df7117556757?w=800&q=80"],
            },
            {
                "slug": "cake-pops-x20",
                "name_fr": "Cake pops (x20)",
                "name_en": "Cake pops (x20)",
                "description_fr": "Vingt cake pops enrobés de chocolat et décorés. Parfait pour les buffets.",
                "description_en": "Twenty chocolate-coated, decorated cake pops. Perfect for buffets.",
                "price_eur": 22.00, "category": "cupcakes-enfants", "brand": "sweet-lab",
                "gender": "anniversaire", "sport": "chocolat", "product_type": "cake-pop",
                "images": ["https://images.unsplash.com/photo-1614707267537-b85aaf00c4b7?w=800&q=80"],
            },

            # --- Personnalisés ---
            {
                "slug": "gateau-photo-personnalise",
                "name_fr": "Gâteau photo personnalisé",
                "name_en": "Custom photo cake",
                "description_fr": "Votre photo préférée imprimée sur un gâteau à la vanille ou au chocolat.",
                "description_en": "Your favorite photo printed on a vanilla or chocolate cake.",
                "price_eur": 42.00, "category": "gateaux-photo", "brand": "atelier-gateau",
                "gender": "anniversaire", "sport": "classique", "product_type": "gâteau",
                "customizable": True, "is_featured": True,
                "images": ["https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=800&q=80"],
            },
            {
                "slug": "gateau-message-sur-mesure",
                "name_fr": "Gâteau message sur mesure",
                "name_en": "Custom message cake",
                "description_fr": "Gâteau tout simple avec un message personnalisé écrit en chocolat.",
                "description_en": "Simple cake with a personalized message written in chocolate.",
                "price_eur": 28.00, "category": "message-sur-mesure", "brand": "patisserie-du-chef",
                "gender": "anniversaire", "sport": "chocolat", "product_type": "gâteau",
                "customizable": True,
                "images": ["https://images.unsplash.com/photo-1571115177098-24ec42ed204d?w=800&q=80"],
            },

            # --- Événements ---
            {
                "slug": "macarons-francais-x20",
                "name_fr": "Macarons français (x20)",
                "name_en": "French macarons (x20)",
                "description_fr": "Assortiment de 20 macarons : pistache, framboise, chocolat, vanille.",
                "description_en": "Assortment of 20 macarons: pistachio, raspberry, chocolate, vanilla.",
                "price_eur": 28.00, "category": "macarons", "brand": "les-delices",
                "gender": "entreprise", "sport": "classique", "product_type": "macaron",
                "is_best_seller": True,
                "images": [
                    "https://images.unsplash.com/photo-1569864358642-9d1684040f43?w=800&q=80",
                    "https://images.unsplash.com/photo-1558326567-98ae2405596b?w=800&q=80",
                ],
            },
            {
                "slug": "buffet-sucre-evenement",
                "name_fr": "Buffet sucré événement",
                "name_en": "Event sweet buffet",
                "description_fr": "Assortiment complet pour un événement : macarons, mini-tartes, cake pops, mignardises.",
                "description_en": "Complete assortment for an event: macarons, mini tarts, cake pops, petits fours.",
                "price_eur": 95.00, "category": "buffets-sucres", "brand": "atelier-gateau",
                "gender": "entreprise", "sport": "classique", "product_type": "buffet",
                "is_new": True, "customizable": True,
                "images": ["https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?w=800&q=80"],
            },

            # --- Régimes spécifiques ---
            {
                "slug": "gateau-sans-gluten-chocolat",
                "name_fr": "Gâteau sans gluten chocolat",
                "name_en": "Gluten-free chocolate cake",
                "description_fr": "Gâteau au chocolat sans gluten, adapté aux intolérants et aux régimes spécifiques.",
                "description_en": "Gluten-free chocolate cake, suitable for intolerances and specific diets.",
                "price_eur": 36.00, "category": "gateaux-adultes", "brand": "patisserie-du-chef",
                "gender": "anniversaire", "sport": "sans-gluten", "product_type": "gâteau",
                "images": ["https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=800&q=80"],
            },
            {
                "slug": "gateau-vegan-fruits-rouges",
                "name_fr": "Gâteau vegan fruits rouges",
                "name_en": "Vegan red berries cake",
                "description_fr": "Gâteau 100% végétal aux fruits rouges, sans produits d'origine animale.",
                "description_en": "100% plant-based red berries cake, free from animal products.",
                "price_eur": 38.00, "category": "gateaux-adultes", "brand": "maison-sucre",
                "gender": "anniversaire", "sport": "vegan", "product_type": "gâteau",
                "is_new": True,
                "images": ["https://images.unsplash.com/photo-1571115177098-24ec42ed204d?w=800&q=80"],
            },
            {
                "slug": "cake-design-africain",
                "name_fr": "Cake design saveurs d'Afrique",
                "name_en": "African flavors cake design",
                "description_fr": "Gâteau original aux saveurs de mangue, bissap et coco. Une création signature de l'atelier.",
                "description_en": "Original cake with mango, hibiscus and coconut flavors. A signature workshop creation.",
                "price_eur": 39.90, "category": "gateaux-thematiques", "brand": "saveurs-afrique",
                "gender": "mariage", "sport": "fruits", "product_type": "gâteau",
                "is_new": True, "is_featured": True,
                "images": ["https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=800&q=80"],
            },
        ]

        for dp in DEMO:
            images = dp.pop("images", [])
            cat_id = cats.get(dp.pop("category"))
            brand_id = brands.get(dp.pop("brand"))

            product = Product(
                **dp,
                category_id=cat_id,
                brand_id=brand_id,
                published=True,
                colors=[],
            )
            db.add(product)
            await db.flush()

            # Images multiples
            for i, url in enumerate(images):
                db.add(ProductImage(product_id=product.id, url=url, position=i))

            # Variantes adaptées au type
            ptype = product.product_type or "gâteau"
            if ptype == "cupcake":
                sizes = [("x6", 0), ("x12", 8.0), ("x24", 18.0)]
            elif ptype in ("macaron", "cake-pop"):
                sizes = [("x6", 0), ("x12", 8.0), ("x20", 14.0)]
            elif ptype == "wedding-cake":
                sizes = [("2 étages", 0), ("3 étages", 60.0)]
            elif ptype == "buffet":
                sizes = [("Standard", 0)]
            else:
                sizes = [("4 parts", 0), ("8 parts", 12.0), ("12 parts", 22.0)]

            for size, extra in sizes:
                db.add(ProductVariant(
                    product_id=product.id,
                    size=size,
                    color="",
                    sku=f"{product.slug}-{size}".replace(" ", "-").lower(),
                    stock=10,
                    extra_price_eur=extra,
                ))
        await db.flush()
        logger.info(f"Seeded {len(DEMO)} demo products with images and variants")


@app.on_event("startup")
async def startup():
    try:
        init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.warning(f"Object storage init failed: {e}")
    try:
        async with AsyncSessionLocal() as db:
            # default settings
            for key, value in DEFAULT_SETTINGS.items():
                res = await db.execute(select(Setting).where(Setting.key == key))
                row = res.scalar_one_or_none()
                if not row:
                    db.add(Setting(key=key, value=value))
                elif key == "site" and row.value.get("email") == "contact@actoos.com":
                    row.value = {**value, **{k: v for k, v in row.value.items() if k not in ("email", "phone")}}
                elif key == "hero" and "slides" not in (row.value or {}):
                    old = row.value or {}
                    first = {**value["slides"][0], **{k: old[k] for k in ("title_fr", "title_en", "subtitle_fr", "subtitle_en", "cta_fr", "cta_en", "cta_link") if old.get(k)}}
                    row.value = {"interval_ms": 7000, "slides": [first] + value["slides"][1:]}

            # admin seed (idempotent: only creates the admin when missing)
            admin_email = os.environ.get("ADMIN_EMAIL", "admin@strykos.com").lower()
            admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
            res = await db.execute(select(Profile).where(Profile.email == admin_email))
            admin = res.scalar_one_or_none()
            if not admin:
                legacy = (await db.execute(select(Profile).where(Profile.role == "admin").order_by(Profile.created_at))).scalars().first()
                if legacy and legacy.email != admin_email:
                    legacy.email = admin_email
                    legacy.password_hash = hash_password(admin_password)
                else:
                    db.add(Profile(email=admin_email, password_hash=hash_password(admin_password),
                                   first_name="Admin", last_name="CAKESSHOP", role="admin"))
            elif not verify_password(admin_password, admin.password_hash):
                admin.password_hash = hash_password(admin_password)

            # Seed demo data (categories + marques + produits) — uniquement si vide
            await _seed_demo_data(db)

            await db.commit()
        logger.info("Startup seeding complete")
    except Exception as e:
        logger.warning(f"Startup seeding skipped: {e}")