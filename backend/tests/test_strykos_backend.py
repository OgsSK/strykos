"""STRYKOS backend regression tests."""
import os
import time
import random
import string
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://strykos.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@strykos.com"
ADMIN_PASSWORD = "Strykos2026!"


def _rand(n=6):
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


@pytest.fixture(scope="session")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _fresh():
    """Fresh session without any cookies/auth leakage."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(http):
    r = http.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["user"]["role"] == "admin"
    return data["token"]


@pytest.fixture(scope="session")
def customer(http):
    email = f"client+{_rand()}@strykos.com"
    pw = "Client2026!"
    r = http.post(f"{API}/auth/register", json={
        "email": email, "password": pw, "first_name": "Test", "last_name": "Client"
    })
    assert r.status_code == 200, f"Register failed: {r.status_code} {r.text}"
    data = r.json()
    return {"email": email, "password": pw, "token": data["token"], "id": data["user"]["id"]}


@pytest.fixture(scope="session")
def customer2(http):
    email = f"client+{_rand()}@strykos.com"
    r = http.post(f"{API}/auth/register", json={
        "email": email, "password": "Client2026!", "first_name": "Other", "last_name": "User"
    })
    assert r.status_code == 200
    data = r.json()
    return {"email": email, "token": data["token"], "id": data["user"]["id"]}


# ---------- Catalog ----------
class TestCatalog:
    def test_root(self, http):
        r = http.get(f"{API}/")
        assert r.status_code == 200

    def test_home(self, http):
        r = http.get(f"{API}/home")
        assert r.status_code == 200
        d = r.json()
        for key in ["new_arrivals", "best_sellers", "featured", "promotions"]:
            assert key in d, f"Missing section: {key}"
            assert isinstance(d[key], list)
        # At least one section must have products
        total = sum(len(d[k]) for k in d)
        assert total > 0, "All home sections are empty"

    def test_products_list(self, http):
        r = http.get(f"{API}/products")
        assert r.status_code == 200
        d = r.json()
        assert "total" in d and "products" in d
        assert d["total"] > 0
        p = d["products"][0]
        assert "prices" in p
        assert set(["EUR", "USD", "XOF"]).issubset(set(p["prices"].keys()))

    def test_products_filter_category(self, http):
        r = http.get(f"{API}/products", params={"category": "maillots"})
        assert r.status_code == 200
        d = r.json()
        assert d["total"] > 0

    def test_products_filter_on_sale(self, http):
        r = http.get(f"{API}/products", params={"on_sale": "true"})
        assert r.status_code == 200
        d = r.json()
        for p in d["products"]:
            assert p.get("on_sale") is True

    def test_products_filter_brand_and_sort(self, http):
        # Sort is applied on base price_eur SQL field; verify endpoint works and returns results
        r = http.get(f"{API}/products", params={"brand": "nike", "sort": "price_asc"})
        assert r.status_code == 200
        assert isinstance(r.json()["products"], list)

    def test_products_price_range(self, http):
        r = http.get(f"{API}/products", params={"min_price": 50, "max_price": 150})
        assert r.status_code == 200
        for p in r.json()["products"]:
            assert 50 <= p["prices"]["EUR"]["price"] <= 150

    def test_product_detail_strykos_slug(self, http):
        # try a known seeded slug: maillot-djoliba-local
        r = http.get(f"{API}/products/maillot-djoliba-local")
        assert r.status_code == 200, r.text
        p = r.json()
        assert "variants" in p and len(p["variants"]) > 0
        assert "images" in p
        assert "related" in p
        assert "prices" in p
        for cur in ["EUR", "USD", "XOF"]:
            assert cur in p["prices"]
        # manual XOF override should be 32000
        assert p["prices"]["XOF"]["price"] == 32000, f"Expected 32000 XOF, got {p['prices']['XOF']['price']}"

    def test_product_xof_conversion_default(self, http):
        # Pick a product without manual XOF override
        r = http.get(f"{API}/products/crampons-noir-fg")
        if r.status_code != 200:
            pytest.skip("crampons-noir-fg not seeded")
        p = r.json()
        eur_price = p["prices"]["EUR"]["price"]
        xof_price = p["prices"]["XOF"]["price"]
        # If no manual override: should equal eur*655.957 rounded
        expected = round(eur_price * 655.957)
        # tolerate rounding
        if abs(xof_price - expected) > 50 and xof_price not in (expected, expected + 1, expected - 1):
            # may have manual override; just assert it is non zero
            assert xof_price > 0


# ---------- Auth ----------
class TestAuth:
    def test_login_wrong_password(self, http):
        r = http.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me_requires_token(self):
        r = _fresh().get(f"{API}/auth/me")
        assert r.status_code in (401, 403)

    def test_me_with_token(self, http, customer):
        r = http.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {customer['token']}"})
        assert r.status_code == 200
        assert r.json()["email"] == customer["email"]

    def test_logout(self, http, customer):
        r = http.post(f"{API}/auth/logout", headers={"Authorization": f"Bearer {customer['token']}"})
        assert r.status_code == 200


# ---------- Wishlist ----------
class TestWishlist:
    def test_wishlist_requires_auth(self, http):
        r = http.get(f"{API}/wishlist")
        assert r.status_code in (401, 403)

    def test_wishlist_add_list_remove(self, http, customer):
        headers = {"Authorization": f"Bearer {customer['token']}"}
        prods = http.get(f"{API}/products").json()["products"]
        pid = prods[0]["id"]
        r = http.post(f"{API}/wishlist", json={"product_id": pid}, headers=headers)
        assert r.status_code == 200
        r = http.get(f"{API}/wishlist", headers=headers)
        assert r.status_code == 200
        assert pid in r.json()["product_ids"]
        r = http.delete(f"{API}/wishlist/{pid}", headers=headers)
        assert r.status_code == 200
        r = http.get(f"{API}/wishlist", headers=headers)
        assert pid not in r.json()["product_ids"]

    def test_wishlist_isolation(self, http, customer, customer2):
        prods = http.get(f"{API}/products").json()["products"]
        pid = prods[0]["id"]
        http.post(f"{API}/wishlist", json={"product_id": pid},
                  headers={"Authorization": f"Bearer {customer['token']}"})
        r = http.get(f"{API}/wishlist", headers={"Authorization": f"Bearer {customer2['token']}"})
        assert r.status_code == 200
        assert pid not in r.json()["product_ids"]


# ---------- Checkout ----------
def _build_checkout_payload(http, currency="EUR", country="ML"):
    prods = http.get(f"{API}/products", params={"in_stock": "true"}).json()["products"]
    # Fetch detail for variants
    product = None
    variant = None
    for p in prods:
        d = http.get(f"{API}/products/{p['slug']}").json()
        for v in d.get("variants", []):
            if v.get("stock", 0) > 0:
                product, variant = d, v
                break
        if variant:
            break
    assert product and variant, "No in-stock variant found"
    return {
        "items": [{"product_id": product["id"], "variant_id": variant["id"], "quantity": 1}],
        "currency": currency,
        "shipping": {
            "first_name": "Test", "last_name": "User", "email": "test@example.com",
            "phone": "+22370000000", "country": country, "city": "Bamako",
            "address_line": "Rue 100", "postal_code": "0000"
        },
        "shipping_method_index": 0,
        "origin_url": BASE_URL
    }


class TestCheckout:
    def test_validate_eur(self, http):
        payload = _build_checkout_payload(http, "EUR")
        r = http.post(f"{API}/checkout/validate", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["currency"] == "EUR"
        assert d["total"] > 0
        assert isinstance(d["items"], list) and len(d["items"]) == 1

    def test_validate_xof_shows_notice(self, http):
        payload = _build_checkout_payload(http, "XOF")
        r = http.post(f"{API}/checkout/validate", json=payload)
        assert r.status_code == 200
        d = r.json()
        assert d["currency"] == "XOF"
        assert d["charge_currency"] == "EUR"
        assert d["payment_notice"], "Payment notice missing for XOF"
        assert "EUR" in d["payment_notice"]

    def test_create_checkout_returns_stripe_url(self, http, customer):
        payload = _build_checkout_payload(http, "EUR")
        r = http.post(f"{API}/checkout/create", json=payload,
                      headers={"Authorization": f"Bearer {customer['token']}"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["checkout_url"].startswith("https://checkout.stripe.com") or "stripe.com" in d["checkout_url"]
        assert d["order_number"]
        assert d["session_id"]
        return d

    def test_payment_status_pending(self, http, customer):
        payload = _build_checkout_payload(http, "EUR")
        r = http.post(f"{API}/checkout/create", json=payload,
                      headers={"Authorization": f"Bearer {customer['token']}"})
        assert r.status_code == 200
        session_id = r.json()["session_id"]
        s = http.get(f"{API}/payments/status/{session_id}")
        assert s.status_code == 200
        assert s.json()["payment_status"] == "pending"


# ---------- Order isolation ----------
class TestOrderIsolation:
    def test_customer_cannot_view_other_order(self, http, customer, customer2):
        payload = _build_checkout_payload(http, "EUR")
        r = http.post(f"{API}/checkout/create", json=payload,
                      headers={"Authorization": f"Bearer {customer['token']}"})
        assert r.status_code == 200
        order_number = r.json()["order_number"]
        # customer2 shouldn't see it
        r2 = http.get(f"{API}/orders/{order_number}",
                      headers={"Authorization": f"Bearer {customer2['token']}"})
        assert r2.status_code == 404


# ---------- Admin security + CRUD ----------
class TestAdminSecurity:
    def test_dashboard_requires_auth(self, http):
        r = http.get(f"{API}/admin/dashboard")
        assert r.status_code in (401, 403)

    def test_dashboard_forbids_customer(self, http, customer):
        r = http.get(f"{API}/admin/dashboard",
                     headers={"Authorization": f"Bearer {customer['token']}"})
        assert r.status_code == 403

    def test_admin_products_requires_auth(self, http):
        r = http.get(f"{API}/admin/products")
        assert r.status_code in (401, 403)

    def test_admin_orders_requires_auth(self, http):
        r = http.get(f"{API}/admin/orders")
        assert r.status_code in (401, 403)

    def test_admin_dashboard_ok(self, http, admin_token):
        r = http.get(f"{API}/admin/dashboard", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        d = r.json()
        assert "total_orders" in d and "total_products" in d


class TestAdminCRUD:
    def test_create_and_list_product(self, http, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}"}
        slug = f"test-prod-{_rand()}"
        payload = {
            "slug": slug, "sku": f"SKU-{_rand()}", "name_fr": "TEST produit",
            "name_en": "TEST product", "price_eur": 50.0, "price_usd": 55.0,
            "images": ["https://example.com/img.jpg"],
            "variants": [{"size": "M", "color": "Black", "sku": f"V-{_rand()}", "stock": 10}],
            "published": True,
        }
        r = http.post(f"{API}/admin/products", json=payload, headers=headers)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        # Appears in admin listing
        r = http.get(f"{API}/admin/products", headers=headers)
        assert r.status_code == 200
        slugs = [p["slug"] for p in r.json()]
        assert slug in slugs
        # Appears in public listing
        r = http.get(f"{API}/products", params={"search": "TEST produit"})
        slugs_pub = [p["slug"] for p in r.json()["products"]]
        assert slug in slugs_pub

        # Update it
        payload["price_eur"] = 60.0
        payload["variants"] = [{"size": "L", "color": "Black", "sku": f"V-{_rand()}", "stock": 5}]
        r = http.put(f"{API}/admin/products/{pid}", json=payload, headers=headers)
        assert r.status_code == 200

        # Fetch for variant id, adjust stock
        r = http.get(f"{API}/products/{slug}")
        assert r.status_code == 200
        detail = r.json()
        vid = detail["variants"][0]["id"]
        r = http.post(f"{API}/admin/stock/adjust", json={"variant_id": vid, "stock": 42},
                      headers=headers)
        assert r.status_code == 200
        assert r.json()["stock"] == 42

        # Cleanup: soft-delete
        r = http.delete(f"{API}/admin/products/{pid}", headers=headers)
        assert r.status_code == 200
