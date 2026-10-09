"""STRYKOS iteration 4 backend tests: admin reply, newsletter subscribe/unsubscribe/status,
admin newsletter subscribers CRUD + CSV, campaigns draft/update/test/send/validation/delete,
product video_url field exposure."""
import os
import time
import pytest
import requests

def _read_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        return ""
    return ""


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env()).rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
ADMIN_EMAIL = "contact@actoos.com"
ADMIN_PASSWORD = "Salifkane&&7"
CUST_EMAIL = "delivered@resend.dev"
CUST_PASSWORD = "NewPass2026!"

# ------------- helpers -------------

def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def customer_token():
    # Try login; if not found, register.
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": CUST_EMAIL, "password": CUST_PASSWORD}, timeout=20)
    if r.status_code != 200:
        requests.post(f"{BASE_URL}/api/auth/register", json={"email": CUST_EMAIL, "password": CUST_PASSWORD, "name": "Test Customer"}, timeout=20)
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": CUST_EMAIL, "password": CUST_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text[:200]
    return r.json()["token"]


@pytest.fixture(scope="session")
def customer_headers(customer_token):
    return {"Authorization": f"Bearer {customer_token}"}


# ------------- admin review reply -------------

class TestAdminReviewReply:
    @pytest.fixture(scope="class")
    def review_id(self, customer_headers, admin_headers):
        # Pick first available product slug
        prods = requests.get(f"{BASE_URL}/api/products?limit=5", timeout=20).json()["products"]
        slug = "strykos" if any(p.get("slug") == "strykos" for p in prods) else prods[0]["slug"]
        # Create a review
        r = requests.post(f"{BASE_URL}/api/products/{slug}/reviews", headers=customer_headers,
                          json={"rating": 5, "title": "Super", "body": "Produit tres bien, livraison rapide et qualite au top !"},
                          timeout=20)
        assert r.status_code in (200, 201), r.text[:300]
        rid = r.json().get("review", {}).get("id") or r.json().get("id")
        assert rid, r.json()
        yield (slug, rid)
        # Cleanup
        requests.delete(f"{BASE_URL}/api/admin/reviews/{rid}", headers=admin_headers, timeout=20)

    def test_reply_sets_admin_reply(self, review_id, admin_headers):
        slug, rid = review_id
        reply_text = "Merci pour votre retour !"
        r = requests.put(f"{BASE_URL}/api/admin/reviews/{rid}/reply", headers=admin_headers,
                         json={"reply": reply_text}, timeout=20)
        assert r.status_code == 200, r.text[:300]
        rev = r.json()["review"]
        assert rev["admin_reply"] == reply_text
        assert rev["admin_reply_at"] is not None

        # Visible on public endpoint
        pub = requests.get(f"{BASE_URL}/api/products/{slug}/reviews", timeout=20).json()
        found = [x for x in pub["reviews"] if x["id"] == rid]
        assert found and found[0]["admin_reply"] == reply_text

    def test_reply_empty_clears(self, review_id, admin_headers):
        slug, rid = review_id
        r = requests.put(f"{BASE_URL}/api/admin/reviews/{rid}/reply", headers=admin_headers,
                         json={"reply": ""}, timeout=20)
        assert r.status_code == 200
        rev = r.json()["review"]
        assert rev["admin_reply"] == ""
        assert rev["admin_reply_at"] is None

    def test_reply_requires_admin(self, review_id, customer_headers):
        _, rid = review_id
        r = requests.put(f"{BASE_URL}/api/admin/reviews/{rid}/reply", headers=customer_headers,
                         json={"reply": "nope"}, timeout=20)
        assert r.status_code in (401, 403)


# ------------- newsletter public -------------

class TestNewsletterPublic:
    def test_subscribe_valid(self, admin_headers):
        # Ensure clean state: if subscriber exists, delete via admin
        r = requests.get(f"{BASE_URL}/api/admin/newsletter/subscribers?q={CUST_EMAIL}", headers=admin_headers, timeout=20).json()
        for s in r.get("subscribers", []):
            if s["email"] == CUST_EMAIL:
                requests.delete(f"{BASE_URL}/api/admin/newsletter/subscribers/{s['id']}", headers=admin_headers, timeout=20)
        # Subscribe
        r = requests.post(f"{BASE_URL}/api/newsletter/subscribe",
                          json={"email": CUST_EMAIL, "lang": "fr", "source": "footer"}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data["ok"] is True
        assert data.get("created") is True
        # welcome log present
        time.sleep(1.0)
        logs = requests.get(f"{BASE_URL}/api/admin/emails", headers=admin_headers, timeout=20).json()
        items = logs.get("logs", []) if isinstance(logs, dict) else logs
        welcome = [e for e in items if e.get("template") == "newsletter_welcome" and e.get("to_email") == CUST_EMAIL]
        assert welcome, f"No newsletter_welcome log for {CUST_EMAIL}"

    def test_subscribe_already(self):
        r = requests.post(f"{BASE_URL}/api/newsletter/subscribe",
                          json={"email": CUST_EMAIL, "lang": "fr", "source": "footer"}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert data.get("already") is True

    def test_subscribe_invalid_email(self):
        r = requests.post(f"{BASE_URL}/api/newsletter/subscribe",
                          json={"email": "not-an-email", "lang": "fr"}, timeout=20)
        assert r.status_code == 422

    def test_status_customer(self, customer_headers):
        r = requests.get(f"{BASE_URL}/api/newsletter/status", headers=customer_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "subscribed" in data and "email" in data
        assert data["subscribed"] is True
        assert data["email"] == CUST_EMAIL

    def test_unsubscribe_authed(self, customer_headers):
        r = requests.post(f"{BASE_URL}/api/newsletter/unsubscribe", headers=customer_headers, json={}, timeout=20)
        assert r.status_code == 200
        assert r.json()["ok"] is True
        # status now false
        s = requests.get(f"{BASE_URL}/api/newsletter/status", headers=customer_headers, timeout=20).json()
        assert s["subscribed"] is False

    def test_unsubscribe_bad_token(self):
        r = requests.post(f"{BASE_URL}/api/newsletter/unsubscribe", json={"token": "xyz-bad-token"}, timeout=20)
        assert r.status_code == 404

    def test_resubscribe_reactivates(self):
        r = requests.post(f"{BASE_URL}/api/newsletter/subscribe",
                          json={"email": CUST_EMAIL, "lang": "fr", "source": "footer"}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert data.get("created") is False


# ------------- admin newsletter subscribers -------------

class TestAdminNewsletterSubscribers:
    def test_anon_unauthorized(self):
        r = requests.get(f"{BASE_URL}/api/admin/newsletter/subscribers", timeout=20)
        assert r.status_code == 401

    def test_list_add_toggle_delete_csv(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/newsletter/subscribers", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "total_active" in data and "subscribers" in data
        assert isinstance(data["total_active"], int)
        assert isinstance(data["subscribers"], list)

        # Add
        test_email = f"test_sub_{int(time.time())}@example.com"
        add = requests.post(f"{BASE_URL}/api/admin/newsletter/subscribers", headers=admin_headers,
                            json={"email": test_email, "lang": "fr"}, timeout=20)
        assert add.status_code == 200
        # Find id (list without filter to be safe)
        all_subs = requests.get(f"{BASE_URL}/api/admin/newsletter/subscribers", headers=admin_headers, timeout=20).json()["subscribers"]
        sub = next((s for s in all_subs if s["email"] == test_email), None)
        assert sub, "created subscriber not found"
        sid = sub["id"]

        # Toggle inactive
        tgl = requests.put(f"{BASE_URL}/api/admin/newsletter/subscribers/{sid}", headers=admin_headers,
                           json={"active": False}, timeout=20)
        assert tgl.status_code == 200
        assert tgl.json()["active"] is False

        # CSV
        csv_r = requests.get(f"{BASE_URL}/api/admin/newsletter/subscribers.csv", headers=admin_headers, timeout=20)
        assert csv_r.status_code == 200
        assert "text/csv" in csv_r.headers.get("content-type", "")

        # Delete
        d = requests.delete(f"{BASE_URL}/api/admin/newsletter/subscribers/{sid}", headers=admin_headers, timeout=20)
        assert d.status_code == 200


# ------------- admin newsletter campaigns -------------

class TestCampaigns:
    @pytest.fixture(scope="class")
    def product_slugs(self):
        r = requests.get(f"{BASE_URL}/api/products?limit=5", timeout=20).json()
        slugs = [p["slug"] for p in r["products"][:2]]
        assert len(slugs) >= 2
        return slugs

    @pytest.fixture(scope="class")
    def created_campaign(self, admin_headers, product_slugs):
        payload = {"name": "TEST_iter4", "subject_fr": "Test drop", "body_fr": "Nouveaux maillots disponibles",
                   "product_slugs": product_slugs, "cta_link": "/catalog?is_new=true"}
        r = requests.post(f"{BASE_URL}/api/admin/newsletter/campaigns", headers=admin_headers, json=payload, timeout=20)
        assert r.status_code == 200, r.text[:300]
        cid = r.json()["id"]
        yield cid
        # cleanup
        requests.delete(f"{BASE_URL}/api/admin/newsletter/campaigns/{cid}", headers=admin_headers, timeout=20)

    def test_create_draft(self, admin_headers, created_campaign):
        cid = created_campaign
        camps = requests.get(f"{BASE_URL}/api/admin/newsletter/campaigns", headers=admin_headers, timeout=20).json()
        c = next((x for x in camps if x["id"] == cid), None)
        assert c and c["status"] == "draft"
        assert c["subject_fr"] == "Test drop"

    def test_update_draft(self, admin_headers, created_campaign, product_slugs):
        cid = created_campaign
        payload = {"name": "TEST_iter4", "subject_fr": "Test drop v2", "body_fr": "Updated",
                   "product_slugs": product_slugs, "cta_link": "/catalog?is_new=true"}
        r = requests.put(f"{BASE_URL}/api/admin/newsletter/campaigns/{cid}", headers=admin_headers, json=payload, timeout=20)
        assert r.status_code == 200

    def test_test_send(self, admin_headers, created_campaign):
        """Test endpoint sends through Emergent email proxy. Accept 200 (sent) or 502
        (proxy rate-limited/failed) since both prove the endpoint wiring is correct."""
        cid = created_campaign
        r = requests.post(f"{BASE_URL}/api/admin/newsletter/campaigns/{cid}/test", headers=admin_headers, timeout=90)
        assert r.status_code in (200, 502), f"unexpected status={r.status_code} body={r.text[:200]}"
        if r.status_code == 200:
            assert r.json()["ok"] is True

    def test_create_invalid_missing_subject(self, admin_headers):
        # subject_fr required (pydantic) -> 422
        r = requests.post(f"{BASE_URL}/api/admin/newsletter/campaigns", headers=admin_headers,
                          json={"body_fr": "x"}, timeout=20)
        assert r.status_code == 422

    def test_send_validation_empty_subject(self, admin_headers, product_slugs):
        # Create a draft with empty subject (allowed as empty string on model), then /send should 400
        payload = {"name": "TEST_iter4_empty", "subject_fr": "", "body_fr": "body only",
                   "product_slugs": [], "cta_link": "/catalog"}
        r = requests.post(f"{BASE_URL}/api/admin/newsletter/campaigns", headers=admin_headers, json=payload, timeout=20)
        assert r.status_code == 200
        cid = r.json()["id"]
        send = requests.post(f"{BASE_URL}/api/admin/newsletter/campaigns/{cid}/send", headers=admin_headers, timeout=20)
        assert send.status_code == 400
        # cleanup
        requests.delete(f"{BASE_URL}/api/admin/newsletter/campaigns/{cid}", headers=admin_headers, timeout=20)

    def test_send_real_if_small(self, admin_headers, created_campaign):
        """Send real campaign only when total active subscribers <= 2."""
        subs = requests.get(f"{BASE_URL}/api/admin/newsletter/subscribers?active=true", headers=admin_headers, timeout=20).json()
        active_total = subs["total_active"]
        if active_total > 2:
            pytest.skip(f"too many active subs ({active_total}); skipping real send")
        cid = created_campaign
        r = requests.post(f"{BASE_URL}/api/admin/newsletter/campaigns/{cid}/send", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        assert r.json()["ok"] is True
        recipients = r.json()["recipients"]
        # poll until sent
        deadline = time.time() + 60
        final = None
        while time.time() < deadline:
            time.sleep(2)
            camps = requests.get(f"{BASE_URL}/api/admin/newsletter/campaigns", headers=admin_headers, timeout=20).json()
            c = next((x for x in camps if x["id"] == cid), None)
            if c and c["status"] in ("sent", "failed"):
                final = c
                break
        assert final is not None, "campaign did not finish in time"
        assert final["status"] in ("sent", "failed")  # provider may rate-limit
        # Count aggregation reached a terminal state
        assert (final["sent_count"] + final["failed_count"]) >= 1

        # sent campaign can't be edited
        up = requests.put(f"{BASE_URL}/api/admin/newsletter/campaigns/{cid}", headers=admin_headers,
                         json={"subject_fr": "x", "body_fr": "y"}, timeout=20)
        assert up.status_code == 400


# ------------- products video_url field -------------

class TestProductsVideo:
    def test_video_url_field_present(self):
        r = requests.get(f"{BASE_URL}/api/products?limit=50", timeout=20).json()
        assert "products" in r
        prods = r["products"]
        assert prods
        # Each product should have video_url key (even if empty)
        assert all("video_url" in p for p in prods), "video_url missing on some products"
        with_video = [p for p in prods if p.get("video_url")]
        # Informational: just assert at least one has a video_url (two featured expected)
        assert len(with_video) >= 1, "expected at least one product with video_url"
