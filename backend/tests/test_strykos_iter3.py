"""STRYKOS iteration 3 backend tests - admin creds, hero/sections, password reset, reviews, CSV."""
import os
import time
import random
import string
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "contact@actoos.com"
ADMIN_PASSWORD = "Salifkane&&7"
OLD_ADMIN_EMAIL = "admin@strykos.com"
TEST_RECIPIENT = "delivered@resend.dev"

# 1x1 JPEG
_JPEG = bytes.fromhex(
    "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffdb0043010909090c0b0c180d0d1832211c21323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc400b51100020102040403040705040400010277000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9faffda000c03010002110311003f00f7fa28a2803fffd9"
)


def _rand(n=6):
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


@pytest.fixture(scope="module")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(http):
    r = http.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["role"] == "admin"
    return data["token"]


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def customer(http):
    email = f"client+iter3-{_rand()}@strykos.com"
    r = http.post(f"{API}/auth/register", json={
        "email": email, "password": "Client2026!", "first_name": "Iter3", "last_name": "Customer",
    })
    assert r.status_code == 200, r.text
    return {"email": email, "token": r.json()["token"], "id": r.json()["user"]["id"]}


# ---------- Admin credentials ----------
class TestAdminCredentials:
    def test_new_admin_login(self, http):
        r = http.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "admin"

    def test_old_admin_rejected(self, http):
        r = http.post(f"{API}/auth/login", json={"email": OLD_ADMIN_EMAIL, "password": "Strykos2026!"})
        assert r.status_code == 401


# ---------- Hero + Sections settings ----------
class TestHeroSections:
    def test_public_settings_hero(self, http):
        s = http.get(f"{API}/settings").json()
        hero = s.get("hero") or {}
        assert "interval_ms" in hero
        slides = hero.get("slides") or []
        assert len(slides) >= 3, f"Need >=3 slides, got {len(slides)}"
        for sl in slides:
            for k in ("video_url", "image_url", "title_fr", "title_en", "cta_link"):
                assert k in sl, f"Missing {k} in slide: {sl}"

    def test_public_settings_sections(self, http):
        s = http.get(f"{API}/settings").json()
        sections = s.get("sections") or {}
        for key in ("categories", "new_arrivals", "promotions", "best_sellers", "featured"):
            assert key in sections, f"Missing section {key}"
            sec = sections[key]
            for k in ("video_url", "image_url", "tagline_fr", "tagline_en"):
                assert k in sec, f"Missing {k} in section {key}"

    def test_update_hero_and_restore(self, http, admin_h):
        orig = http.get(f"{API}/settings").json()["hero"]
        new_value = {**orig, "interval_ms": 5555}
        r = http.put(f"{API}/admin/settings", json={"key": "hero", "value": new_value}, headers=admin_h)
        assert r.status_code == 200, r.text
        after = http.get(f"{API}/settings").json()["hero"]
        assert after["interval_ms"] == 5555
        # restore
        http.put(f"{API}/admin/settings", json={"key": "hero", "value": orig}, headers=admin_h)
        back = http.get(f"{API}/settings").json()["hero"]
        assert back["interval_ms"] == orig["interval_ms"]

    def test_update_sections_and_restore(self, http, admin_h):
        orig = http.get(f"{API}/settings").json()["sections"]
        new_value = {k: {**v, "tagline_fr": v["tagline_fr"] + " TEST"} for k, v in orig.items()}
        r = http.put(f"{API}/admin/settings", json={"key": "sections", "value": new_value}, headers=admin_h)
        assert r.status_code == 200, r.text
        after = http.get(f"{API}/settings").json()["sections"]
        assert after["categories"]["tagline_fr"].endswith("TEST")
        http.put(f"{API}/admin/settings", json={"key": "sections", "value": orig}, headers=admin_h)
        back = http.get(f"{API}/settings").json()["sections"]
        assert back["categories"]["tagline_fr"] == orig["categories"]["tagline_fr"]


# ---------- Password reset ----------
class TestPasswordReset:
    def test_forgot_unknown_email(self, http):
        r = http.post(f"{API}/auth/forgot-password", json={"email": "unknown+iter3@nowhere.tld"})
        assert r.status_code == 200
        assert r.json() == {"ok": True}

    def test_forgot_existing_email_logs_and_ratelimit(self, http, admin_h):
        # Register a fresh user so no prior rate-limit interferes
        fresh_email = f"delivered+iter3-{_rand()}@resend.dev"
        reg = http.post(f"{API}/auth/register", json={
            "email": fresh_email, "password": "SomePass2026!", "first_name": "Iter3"})
        assert reg.status_code == 200, reg.text
        logs_before = http.get(f"{API}/admin/emails", headers=admin_h).json()["logs"]
        before = [l for l in logs_before if l.get("template") == "password_reset" and l.get("to_email") == fresh_email]
        r = http.post(f"{API}/auth/forgot-password", json={"email": fresh_email})
        assert r.status_code == 200 and r.json() == {"ok": True}
        time.sleep(4)  # allow async log write
        logs_after = http.get(f"{API}/admin/emails", headers=admin_h).json()["logs"]
        after = [l for l in logs_after if l.get("template") == "password_reset" and l.get("to_email") == fresh_email]
        assert len(after) > len(before), "No password_reset log created"
        new_log = after[0]
        assert new_log.get("status") in ("sent", "failed"), new_log

        # Second request within 2min: silent rate-limit, no new log
        r2 = http.post(f"{API}/auth/forgot-password", json={"email": fresh_email})
        assert r2.status_code == 200 and r2.json() == {"ok": True}
        time.sleep(3)
        logs_final = http.get(f"{API}/admin/emails", headers=admin_h).json()["logs"]
        final = [l for l in logs_final if l.get("template") == "password_reset" and l.get("to_email") == fresh_email]
        assert len(final) == len(after), "Rate-limit failed; second request also sent email"

    def test_reset_bad_token(self, http):
        r = http.post(f"{API}/auth/reset-password", json={"token": "garbage-token", "password": "NewPass2026!"})
        assert r.status_code == 400
        assert "invalide" in r.json()["detail"].lower() or "expire" in r.json()["detail"].lower()

    def test_reset_short_password(self, http):
        r = http.post(f"{API}/auth/reset-password", json={"token": "whatever", "password": "short"})
        assert r.status_code == 400


# ---------- Reviews ----------
_PRODUCT_SLUG = "maillot-djoliba-local"


class TestReviews:
    def test_get_empty_or_struct(self, http):
        r = http.get(f"{API}/products/{_PRODUCT_SLUG}/reviews")
        assert r.status_code == 200
        d = r.json()
        for k in ("count", "average", "distribution", "reviews"):
            assert k in d

    def test_anon_post_rejected(self):
        r = requests.post(f"{API}/products/{_PRODUCT_SLUG}/reviews",
                          json={"rating": 4, "body": "Hello hello"})
        assert r.status_code in (401, 403)

    def test_customer_post_update_and_ratings(self, http, customer):
        hdr = {"Authorization": f"Bearer {customer['token']}"}
        # Create
        r = http.post(f"{API}/products/{_PRODUCT_SLUG}/reviews",
                      json={"rating": 4, "title": "Bien", "body": "Bon produit, taille normale"}, headers=hdr)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["review"]["approved"] is True
        rid = d["review"]["id"]

        # Count after
        r1 = http.get(f"{API}/products/{_PRODUCT_SLUG}/reviews")
        c1 = r1.json()["count"]
        assert c1 >= 1

        # Update (same user, same product)
        r = http.post(f"{API}/products/{_PRODUCT_SLUG}/reviews",
                      json={"rating": 5, "title": "Encore mieux", "body": "Super taille, qualite excellente"}, headers=hdr)
        assert r.status_code == 200
        d2 = r.json()
        assert d2.get("updated") is True
        r2 = http.get(f"{API}/products/{_PRODUCT_SLUG}/reviews")
        assert r2.json()["count"] == c1  # same count

        # Product detail includes rating_avg + review_count
        p = http.get(f"{API}/products/{_PRODUCT_SLUG}").json()
        assert "rating_avg" in p and "review_count" in p
        assert p["review_count"] >= 1

        # Product list items include rating fields
        plist = http.get(f"{API}/products", params={"limit": 20}).json()
        items = plist.get("products") if isinstance(plist, dict) else plist
        assert items and "rating_avg" in items[0] and "review_count" in items[0]

        # DELETE by owner
        rd = http.delete(f"{API}/reviews/{rid}", headers=hdr)
        assert rd.status_code == 200

    def test_rating_out_of_range(self, http, customer):
        hdr = {"Authorization": f"Bearer {customer['token']}"}
        r = http.post(f"{API}/products/{_PRODUCT_SLUG}/reviews",
                      json={"rating": 6, "body": "Too high"}, headers=hdr)
        assert r.status_code == 422

    def test_body_too_short(self, http, customer):
        hdr = {"Authorization": f"Bearer {customer['token']}"}
        r = http.post(f"{API}/products/{_PRODUCT_SLUG}/reviews",
                      json={"rating": 3, "body": "ok"}, headers=hdr)
        assert r.status_code == 422


class TestReviewUpload:
    def test_upload_jpeg(self, customer):
        files = {"file": ("r.jpg", _JPEG, "image/jpeg")}
        r = requests.post(f"{API}/reviews/upload", files=files,
                          headers={"Authorization": f"Bearer {customer['token']}"})
        assert r.status_code == 200, r.text
        url = r.json()["url"]
        assert url.startswith("http"), url
        assert url.lower().endswith(".jpg")

    def test_upload_text_rejected(self, customer):
        files = {"file": ("f.txt", b"hello", "text/plain")}
        r = requests.post(f"{API}/reviews/upload", files=files,
                          headers={"Authorization": f"Bearer {customer['token']}"})
        assert r.status_code == 400


class TestAdminReviews:
    @pytest.fixture
    def seeded_review(self, http, customer):
        hdr = {"Authorization": f"Bearer {customer['token']}"}
        r = http.post(f"{API}/products/{_PRODUCT_SLUG}/reviews",
                      json={"rating": 5, "title": "Admin test", "body": "Review for admin moderation tests"}, headers=hdr)
        assert r.status_code == 200
        return r.json()["review"]

    def test_admin_list_includes_product_info(self, http, admin_h, seeded_review):
        r = http.get(f"{API}/admin/reviews", headers=admin_h)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 1
        row = next((x for x in rows if x["id"] == seeded_review["id"]), None)
        assert row is not None
        assert row["product"] and "name" in row["product"] and "slug" in row["product"]

    def test_approve_toggle(self, http, admin_h, seeded_review):
        rid = seeded_review["id"]
        # Hide
        r = http.put(f"{API}/admin/reviews/{rid}/approve", json={"approved": False}, headers=admin_h)
        assert r.status_code == 200
        pub = http.get(f"{API}/products/{_PRODUCT_SLUG}/reviews").json()
        assert all(rv["id"] != rid for rv in pub["reviews"]), "Hidden review still public"
        # Re-approve
        http.put(f"{API}/admin/reviews/{rid}/approve", json={"approved": True}, headers=admin_h)

    def test_admin_delete(self, http, admin_h, seeded_review):
        rid = seeded_review["id"]
        r = http.delete(f"{API}/admin/reviews/{rid}", headers=admin_h)
        assert r.status_code == 200


# ---------- CSV exports ----------
class TestCsvExports:
    def test_orders_csv_anon(self):
        r = requests.get(f"{API}/admin/export/orders.csv")
        assert r.status_code in (401, 403)

    def test_orders_csv_admin(self, admin_h):
        r = requests.get(f"{API}/admin/export/orders.csv", headers=admin_h)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "text/csv" in ct
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower()
        first_line = r.text.lstrip("\ufeff").splitlines()[0]
        assert first_line.startswith("Numero;Date;Statut"), first_line

    def test_orders_csv_status_filter(self, admin_h):
        r = requests.get(f"{API}/admin/export/orders.csv?status=paid", headers=admin_h)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")

    def test_stock_csv_admin(self, admin_h):
        r = requests.get(f"{API}/admin/export/stock.csv", headers=admin_h)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        first_line = r.text.lstrip("\ufeff").splitlines()[0]
        assert first_line.startswith("SKU produit;Nom FR"), first_line

    def test_stock_csv_anon(self):
        r = requests.get(f"{API}/admin/export/stock.csv")
        assert r.status_code in (401, 403)
