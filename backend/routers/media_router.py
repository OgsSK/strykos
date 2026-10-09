import os
import re
import uuid
import asyncio
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import MediaFile
from auth import get_current_admin
from storage import put_object, get_object, APP_NAME

router = APIRouter(tags=["media"])

TMP_DIR = Path("/tmp/strykos_uploads")
ALLOWED_IMAGE = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"}
ALLOWED_VIDEO = {"video/mp4", "video/webm", "video/quicktime"}
MAX_IMAGE = 15 * 1024 * 1024
MAX_VIDEO = 300 * 1024 * 1024
_cache: dict[str, tuple[bytes, str]] = {}
_cache_bytes = 0
CACHE_LIMIT = 80 * 1024 * 1024


def _kind(content_type: str) -> str:
    if content_type in ALLOWED_IMAGE:
        return "image"
    if content_type in ALLOWED_VIDEO:
        return "video"
    raise HTTPException(status_code=400, detail="Format non supporte (images: jpg/png/webp/gif/avif, videos: mp4/webm/mov)")


def _safe_ext(filename: str, content_type: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if not re.fullmatch(r"[a-z0-9]{1,5}", ext):
        ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
               "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov"}.get(content_type, "bin")
    return ext


async def _store(db: AsyncSession, data: bytes, filename: str, content_type: str) -> MediaFile:
    kind = _kind(content_type)
    limit = MAX_VIDEO if kind == "video" else MAX_IMAGE
    if len(data) > limit:
        raise HTTPException(status_code=413, detail=f"Fichier trop volumineux (max {limit // (1024 * 1024)} Mo)")
    path = f"{APP_NAME}/{kind}s/{uuid.uuid4()}.{_safe_ext(filename, content_type)}"
    try:
        result = await asyncio.to_thread(put_object, path, data, content_type)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Stockage indisponible: {str(e)[:120]}")
    m = MediaFile(storage_path=result["path"], original_filename=filename[:255], content_type=content_type,
                  kind=kind, size=result.get("size", len(data)))
    db.add(m)
    await db.commit()
    await db.refresh(m)
    return m


@router.post("/admin/media/upload", dependencies=[Depends(get_current_admin)])
async def upload_media(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    data = await file.read()
    m = await _store(db, data, file.filename or "file", file.content_type or "application/octet-stream")
    return m.to_dict()


@router.post("/admin/media/upload/chunk", dependencies=[Depends(get_current_admin)])
async def upload_chunk(upload_id: str = Form(...), index: int = Form(...), chunk: UploadFile = File(...)):
    if not re.fullmatch(r"[a-f0-9-]{36}", upload_id):
        raise HTTPException(status_code=400, detail="upload_id invalide")
    d = TMP_DIR / upload_id
    d.mkdir(parents=True, exist_ok=True)
    (d / f"{index:06d}").write_bytes(await chunk.read())
    return {"ok": True, "index": index}


class CompleteIn(BaseModel):
    upload_id: str
    filename: str
    content_type: str
    total_chunks: int


@router.post("/admin/media/upload/complete", dependencies=[Depends(get_current_admin)])
async def upload_complete(data: CompleteIn, db: AsyncSession = Depends(get_db)):
    d = TMP_DIR / data.upload_id
    if not d.exists():
        raise HTTPException(status_code=404, detail="Upload introuvable")
    parts = sorted(d.iterdir())
    if len(parts) != data.total_chunks:
        raise HTTPException(status_code=400, detail=f"Chunks manquants ({len(parts)}/{data.total_chunks})")
    blob = b"".join(p.read_bytes() for p in parts)
    shutil.rmtree(d, ignore_errors=True)
    m = await _store(db, blob, data.filename, data.content_type)
    return m.to_dict()


@router.get("/admin/media", dependencies=[Depends(get_current_admin)])
async def list_media(kind: str | None = None, db: AsyncSession = Depends(get_db)):
    q = select(MediaFile).where(MediaFile.is_deleted == False).order_by(MediaFile.created_at.desc()).limit(300)
    if kind:
        q = q.where(MediaFile.kind == kind)
    res = await db.execute(q)
    return [m.to_dict() for m in res.scalars().all()]


@router.delete("/admin/media/{media_id}", dependencies=[Depends(get_current_admin)])
async def delete_media(media_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(MediaFile).where(MediaFile.id == media_id))
    m = res.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Media introuvable")
    m.is_deleted = True
    await db.commit()
    _cache.pop(m.storage_path, None)
    return {"ok": True}


@router.get("/media/{path:path}")
async def serve_media(path: str, db: AsyncSession = Depends(get_db)):
    global _cache_bytes
    if not path.startswith(f"{APP_NAME}/") or ".." in path:
        raise HTTPException(status_code=404, detail="Not found")
    cached = _cache.get(path)
    if cached:
        content, ctype = cached
    else:
        res = await db.execute(select(MediaFile).where(MediaFile.storage_path == path, MediaFile.is_deleted == False))
        m = res.scalar_one_or_none()
        if not m:
            raise HTTPException(status_code=404, detail="Not found")
        try:
            content, ctype = await asyncio.to_thread(get_object, path)
        except Exception:
            raise HTTPException(status_code=502, detail="Media unavailable")
        ctype = m.content_type or ctype
        if len(content) < 8 * 1024 * 1024:
            if _cache_bytes + len(content) > CACHE_LIMIT:
                _cache.clear(); _cache_bytes = 0
            _cache[path] = (content, ctype); _cache_bytes += len(content)
    return Response(content=content, media_type=ctype,
                    headers={"Cache-Control": "public, max-age=31536000, immutable"})
