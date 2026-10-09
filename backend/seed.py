"""Seed demo catalog data into Supabase. Idempotent by slug. Run: python seed.py"""
import asyncio
from sqlalchemy import select
from database import AsyncSessionLocal
from models import Brand, Category, Product, ProductImage, ProductVariant

BRANDS = [
    {"name": "Nike", "slug": "nike", "is_local": False},
    {"name": "adidas", "slug": "adidas", "is_local": False},
    {"name": "PUMA", "slug": "puma", "is_local": False},
    {"name": "New Balance", "slug": "new-balance", "is_local": False},
    {"name": "Djoliba Sport", "slug": "djoliba-sport", "is_local": True,
     "description_fr": "Marque locale malienne de materiel de football.",
     "description_en": "Local Malian football gear brand."},
    {"name": "Sahel Athletics", "slug": "sahel-athletics", "is_local": True,
     "description_fr": "Marque africaine de vetements de sport.",
     "description_en": "African sportswear brand."},
]

CATEGORIES = [
    {"slug": "maillots", "name_fr": "Maillots", "name_en": "Jerseys", "type": "maillots", "position": 1},
    {"slug": "chaussures", "name_fr": "Chaussures", "name_en": "Boots", "type": "chaussures", "position": 2},
    {"slug": "vetements", "name_fr": "Vetements", "name_en": "Clothing", "type": "vetements", "position": 3},
    {"slug": "equipements", "name_fr": "Equipements", "name_en": "Equipment", "type": "equipements", "position": 4},
    {"slug": "accessoires", "name_fr": "Accessoires", "name_en": "Accessories", "type": "accessoires", "position": 5},
]

SIZES_APPAREL = ["S", "M", "L", "XL", "XXL"]
SIZES_BOOTS = ["39", "40", "41", "42", "43", "44", "45"]

PRODUCTS = [
    # ---- Maillots ----
    {"slug": "maillot-domicile-rouge-authentique", "sku": "STK-J001", "brand": "adidas", "cat": "maillots",
     "name_fr": "Maillot Domicile Rouge Authentique", "name_en": "Authentic Red Home Jersey",
     "desc_fr": "Maillot domicile en tissu respirant, coupe joueur. Produit authentique.",
     "desc_en": "Home jersey in breathable fabric, player fit. Authentic product.",
     "price_eur": 89.99, "club": "Club Atlas", "product_type": "home", "customizable": True,
     "customization_price_eur": 12.0, "is_new": True, "is_featured": True, "colors": ["Rouge"],
     "imgs": ["https://images.unsplash.com/photo-1577212017184-80cc0da11082?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
              "https://images.unsplash.com/photo-1616124619460-ff4ed8f4683c?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"],
     "sizes": SIZES_APPAREL, "stock": [8, 12, 15, 6, 0]},
    {"slug": "maillot-selection-jaune", "sku": "STK-J002", "brand": "Nike", "cat": "maillots",
     "name_fr": "Maillot Selection Jaune", "name_en": "Yellow National Team Jersey",
     "desc_fr": "Maillot officiel selection nationale, edition domicile.",
     "desc_en": "Official national team jersey, home edition.",
     "price_eur": 94.99, "national_team": "Bresil", "product_type": "home", "is_best_seller": True,
     "customizable": True, "customization_price_eur": 12.0, "colors": ["Jaune"],
     "imgs": ["https://images.unsplash.com/photo-1552066379-e7bfd22155c5?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"],
     "sizes": SIZES_APPAREL, "stock": [10, 10, 10, 5, 3]},
    {"slug": "maillot-exterieur-bleu", "sku": "STK-J003", "brand": "PUMA", "cat": "maillots",
     "name_fr": "Maillot Exterieur Bleu", "name_en": "Blue Away Jersey",
     "desc_fr": "Maillot exterieur leger et confortable.", "desc_en": "Lightweight comfortable away jersey.",
     "price_eur": 84.99, "sale_price_eur": 64.99, "club": "Olympique Marine", "product_type": "away",
     "is_featured": True, "colors": ["Bleu", "Blanc"],
     "imgs": ["https://images.unsplash.com/photo-1610736342326-b59eb016ba95?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"],
     "sizes": SIZES_APPAREL, "stock": [5, 8, 9, 4, 2]},
    {"slug": "maillot-third-raye", "sku": "STK-J004", "brand": "Nike", "cat": "maillots",
     "name_fr": "Maillot Third Raye", "name_en": "Striped Third Jersey",
     "desc_fr": "Edition third, design raye moderne.", "desc_en": "Third edition, modern striped design.",
     "price_eur": 79.99, "club": "Club Atlas", "product_type": "third", "is_new": True,
     "colors": ["Noir", "Blanc"],
     "imgs": ["https://images.unsplash.com/photo-1616124619460-ff4ed8f4683c?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"],
     "sizes": SIZES_APPAREL, "stock": [6, 7, 8, 3, 1]},
    {"slug": "maillot-selection-rouge-edition", "sku": "STK-J005", "brand": "adidas", "cat": "maillots",
     "name_fr": "Maillot Selection Edition Speciale", "name_en": "Special Edition National Jersey",
     "desc_fr": "Edition limitee selection nationale.", "desc_en": "Limited national team edition.",
     "price_eur": 99.99, "sale_price_eur": 79.99, "national_team": "Mali", "product_type": "home",
     "is_best_seller": True, "is_featured": True, "colors": ["Rouge", "Vert"],
     "imgs": ["https://images.unsplash.com/photo-1614170059029-3b7422659b37?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"],
     "sizes": SIZES_APPAREL, "stock": [12, 14, 16, 8, 4]},
    # ---- Chaussures ----
    {"slug": "crampons-rouge-fg", "sku": "STK-B001", "brand": "Nike", "cat": "chaussures",
     "name_fr": "Crampons Rouge Terrain Naturel", "name_en": "Red Firm Ground Boots",
     "desc_fr": "Chaussures FG, legeres et precises.", "desc_en": "FG boots, light and precise.",
     "price_eur": 129.99, "surface": "FG", "product_type": "boots", "is_new": True, "is_featured": True,
     "colors": ["Rouge"],
     "imgs": ["https://images.unsplash.com/photo-1770029606852-38309868b4ee?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"],
     "sizes": SIZES_BOOTS, "stock": [3, 5, 6, 7, 6, 4, 2]},
    {"slug": "crampons-noir-fg", "sku": "STK-B002", "brand": "adidas", "cat": "chaussures",
     "name_fr": "Crampons Noir Terrain Naturel", "name_en": "Black Firm Ground Boots",
     "desc_fr": "Classiques FG noir, confort optimal.", "desc_en": "Classic black FG, optimal comfort.",
     "price_eur": 119.99, "sale_price_eur": 89.99, "surface": "FG", "product_type": "boots",
     "is_best_seller": True, "colors": ["Noir"],
     "imgs": ["https://images.unsplash.com/photo-1511886929837-354d827aae26?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"],
     "sizes": SIZES_BOOTS, "stock": [4, 6, 8, 8, 5, 3, 1]},
    {"slug": "crampons-bleu-ag", "sku": "STK-B003", "brand": "PUMA", "cat": "chaussures",
     "name_fr": "Crampons Bleu Gazon Artificiel", "name_en": "Blue Artificial Ground Boots",
     "desc_fr": "Semelle AG adaptee au synthetique.", "desc_en": "AG sole for synthetic turf.",
     "price_eur": 109.99, "surface": "AG", "product_type": "boots", "colors": ["Bleu", "Noir"],
     "imgs": ["https://images.unsplash.com/photo-1511426463457-0571e247d816?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"],
     "sizes": SIZES_BOOTS, "stock": [2, 4, 5, 6, 5, 3, 2]},
    {"slug": "crampons-orange-fg", "sku": "STK-B004", "brand": "adidas", "cat": "chaussures",
     "name_fr": "Crampons Orange Terrain Naturel", "name_en": "Orange Firm Ground Boots",
     "desc_fr": "Design audacieux, accroche maximale.", "desc_en": "Bold design, maximum grip.",
     "price_eur": 139.99, "surface": "FG", "product_type": "boots", "is_new": True, "colors": ["Orange"],
     "imgs": ["https://images.unsplash.com/photo-1529900748604-07564a03e7a6?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"],
     "sizes": SIZES_BOOTS, "stock": [3, 4, 5, 5, 4, 3, 1]},
    # ---- Equipements ----
    {"slug": "ballon-officiel-blanc", "sku": "STK-E001", "brand": "PUMA", "cat": "equipements",
     "name_fr": "Ballon Officiel Match", "name_en": "Official Match Ball",
     "desc_fr": "Ballon de match cousu, taille 5.", "desc_en": "Stitched match ball, size 5.",
     "price_eur": 34.99, "product_type": "ball", "is_best_seller": True, "colors": ["Blanc", "Noir"],
     "imgs": ["https://images.unsplash.com/photo-1575361204480-aadea25e6e68?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"],
     "sizes": ["Taille 4", "Taille 5"], "stock": [10, 20]},
    {"slug": "ballon-entrainement-bleu", "sku": "STK-E002", "brand": "Nike", "cat": "equipements",
     "name_fr": "Ballon Entrainement Bleu", "name_en": "Blue Training Ball",
     "desc_fr": "Ballon d'entrainement resistant.", "desc_en": "Durable training ball.",
     "price_eur": 24.99, "product_type": "ball", "colors": ["Bleu"],
     "imgs": ["https://images.unsplash.com/photo-1579952363873-27f3bade9f55?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"],
     "sizes": ["Taille 4", "Taille 5"], "stock": [15, 15]},
    {"slug": "protege-tibias-pro", "sku": "STK-E003", "brand": "Nike", "cat": "equipements",
     "name_fr": "Protege-tibias Pro", "name_en": "Pro Shin Guards",
     "desc_fr": "Protege-tibias legers avec chaussettes.", "desc_en": "Lightweight shin guards with socks.",
     "price_eur": 19.99, "product_type": "shin_guards", "colors": ["Noir", "Blanc"],
     "imgs": ["https://images.unsplash.com/photo-1789925941480-aebc24c038af?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"],
     "sizes": ["S", "M", "L"], "stock": [12, 18, 10]},
    # ---- Vetements ----
    {"slug": "veste-entrainement-noire", "sku": "STK-V001", "brand": "adidas", "cat": "vetements",
     "name_fr": "Veste d'Entrainement Noire", "name_en": "Black Training Jacket",
     "desc_fr": "Veste technique pour l'entrainement.", "desc_en": "Technical training jacket.",
     "price_eur": 59.99, "product_type": "jacket", "is_featured": True, "colors": ["Noir"],
     "imgs": ["https://images.unsplash.com/photo-1540254597053-3901b858d40f?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"],
     "sizes": SIZES_APPAREL, "stock": [6, 8, 8, 4, 2]},
    {"slug": "sweat-entrainement-gris", "sku": "STK-V002", "brand": "Nike", "cat": "vetements",
     "name_fr": "Sweat d'Entrainement Gris", "name_en": "Grey Training Top",
     "desc_fr": "Haut d'entrainement respirant.", "desc_en": "Breathable training top.",
     "price_eur": 44.99, "sale_price_eur": 34.99, "product_type": "top", "colors": ["Gris"],
     "imgs": ["https://images.unsplash.com/photo-1560272564-c83b66b1ad12?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"],
     "sizes": SIZES_APPAREL, "stock": [5, 7, 7, 3, 1]},
    # ---- Accessoires ----
    {"slug": "sac-sport-vert", "sku": "STK-A001", "brand": "New Balance", "cat": "accessoires",
     "name_fr": "Sac de Sport Vert", "name_en": "Green Sports Bag",
     "desc_fr": "Sac de sport spacieux et resistant.", "desc_en": "Spacious durable sports bag.",
     "price_eur": 49.99, "product_type": "bag", "is_new": True, "colors": ["Vert"],
     "imgs": ["https://images.unsplash.com/photo-1692506530242-c12d6c3ae2e2?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"],
     "sizes": ["Unique"], "stock": [14]},
    {"slug": "sac-sport-noir", "sku": "STK-A002", "brand": "Nike", "cat": "accessoires",
     "name_fr": "Sac de Sport Noir", "name_en": "Black Sports Bag",
     "desc_fr": "Sac compact pour les deplacements.", "desc_en": "Compact bag for travel.",
     "price_eur": 39.99, "product_type": "bag", "colors": ["Noir"],
     "imgs": ["https://images.unsplash.com/photo-1567159169514-2211f0280f5f?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"],
     "sizes": ["Unique"], "stock": [20]},
    # ---- Marques locales ----
    {"slug": "maillot-djoliba-local", "sku": "STK-L001", "brand": "Djoliba Sport", "cat": "maillots",
     "name_fr": "Maillot Djoliba Edition Locale", "name_en": "Djoliba Local Edition Jersey",
     "desc_fr": "Maillot concu par une marque malienne.", "desc_en": "Jersey designed by a Malian brand.",
     "price_eur": 54.99, "price_xof": 32000.0, "product_type": "home", "is_featured": True,
     "colors": ["Vert", "Jaune"],
     "imgs": ["https://images.unsplash.com/photo-1662096909714-e2f206d0a636?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"],
     "sizes": SIZES_APPAREL, "stock": [8, 10, 10, 5, 3]},
    {"slug": "sac-sahel-local", "sku": "STK-L002", "brand": "Sahel Athletics", "cat": "accessoires",
     "name_fr": "Sac Sahel Athletics", "name_en": "Sahel Athletics Bag",
     "desc_fr": "Sac de sport d'une marque africaine.", "desc_en": "Sports bag from an African brand.",
     "price_eur": 44.99, "price_xof": 26000.0, "product_type": "bag", "is_new": True, "colors": ["Bleu"],
     "imgs": ["https://images.unsplash.com/photo-1535879335191-618713ec3e3f?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"],
     "sizes": ["Unique"], "stock": [12]},
]


async def run():
    async with AsyncSessionLocal() as db:
        brand_map, cat_map = {}, {}
        for b in BRANDS:
            res = await db.execute(select(Brand).where(Brand.slug == b["slug"]))
            obj = res.scalar_one_or_none()
            if not obj:
                obj = Brand(**b)
                db.add(obj)
                await db.flush()
            brand_map[b["name"]] = obj.id
        for c in CATEGORIES:
            res = await db.execute(select(Category).where(Category.slug == c["slug"]))
            obj = res.scalar_one_or_none()
            if not obj:
                obj = Category(**c)
                db.add(obj)
                await db.flush()
            cat_map[c["slug"]] = obj.id
        await db.commit()

        created = 0
        for p in PRODUCTS:
            res = await db.execute(select(Product).where(Product.slug == p["slug"]))
            if res.scalar_one_or_none():
                continue
            prod = Product(
                slug=p["slug"], sku=p["sku"], brand_id=brand_map.get(p["brand"]),
                category_id=cat_map.get(p["cat"]), name_fr=p["name_fr"], name_en=p["name_en"],
                description_fr=p.get("desc_fr", ""), description_en=p.get("desc_en", ""),
                price_eur=p["price_eur"], price_xof=p.get("price_xof"), sale_price_eur=p.get("sale_price_eur"),
                is_new=p.get("is_new", False), is_featured=p.get("is_featured", False),
                is_best_seller=p.get("is_best_seller", False), club=p.get("club", ""),
                national_team=p.get("national_team", ""), surface=p.get("surface", ""),
                product_type=p.get("product_type", ""), colors=p.get("colors", []),
                customizable=p.get("customizable", False),
                customization_price_eur=p.get("customization_price_eur", 0), published=True,
            )
            db.add(prod)
            await db.flush()
            for i, url in enumerate(p["imgs"]):
                db.add(ProductImage(product_id=prod.id, url=url, position=i))
            for idx, size in enumerate(p["sizes"]):
                stock = p["stock"][idx] if idx < len(p["stock"]) else 5
                db.add(ProductVariant(product_id=prod.id, size=size,
                                      color=(p.get("colors") or [""])[0], sku=f"{p['sku']}-{size}",
                                      stock=stock, extra_price_eur=0))
            created += 1
        await db.commit()
        print(f"Seed complete. Created {created} products.")


if __name__ == "__main__":
    asyncio.run(run())
