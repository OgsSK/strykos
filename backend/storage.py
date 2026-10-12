import os
import logging
import httpx

logger = logging.getLogger("strykos.storage")

SUPABASE_URL = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
SUPABASE_BUCKET = os.environ.get("SUPABASE_MEDIA_BUCKET", "strykos-media")
APP_NAME = "strykos"


def _headers(content_type: str | None = None, upsert: bool = False) -> dict:
    h = {
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "apikey": SUPABASE_KEY,
    }
    if content_type:
        h["Content-Type"] = content_type
    if upsert:
        h["x-upsert"] = "true"
    return h


def _check_config():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("Supabase Storage non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants)")


def init_storage(force: bool = False):
    """Compat ancienne API — plus de 'storage_key' à initialiser, on utilise la clé service_role."""
    _check_config()
    return True


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Upload un objet vers Supabase Storage."""
    _check_config()
    url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{path}"
    with httpx.Client(timeout=180) as client:
        r = client.post(url, headers=_headers(content_type, upsert=True), content=data)
    if r.status_code >= 400:
        raise RuntimeError(f"Supabase Storage {r.status_code}: {r.text[:200]}")
    return {"path": path, "size": len(data)}


def get_object(path: str) -> tuple[bytes, str]:
    """Récupère un objet depuis Supabase Storage."""
    _check_config()
    url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{path}"
    with httpx.Client(timeout=60) as client:
        r = client.get(url, headers=_headers())
    if r.status_code >= 400:
        raise RuntimeError(f"Supabase Storage {r.status_code}: {r.text[:200]}")
    return r.content, r.headers.get("Content-Type", "application/octet-stream")


def delete_object(path: str) -> bool:
    """Supprime un objet (soft-delete côté DB, mais vraiment supprimé côté storage)."""
    _check_config()
    url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{path}"
    with httpx.Client(timeout=30) as client:
        r = client.delete(url, headers=_headers())
    return r.status_code < 400


def public_url(path: str) -> str:
    """Retourne l'URL publique d'un objet (bucket public)."""
    return f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{path}"