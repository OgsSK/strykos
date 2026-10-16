import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

load_dotenv(Path(__file__).parent / '.env')

DATABASE_URL = os.environ['DATABASE_URL']

# ⭐ FIX : asyncpg n'accepte PAS 'sslmode' → on le retire de l'URL
def _clean_url_for_asyncpg(url: str) -> str:
    """Convertit postgresql:// en postgresql+asyncpg:// et retire sslmode (asyncpg utilise 'ssl')."""
    # Convertir le schéma
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)

    # Parser et retirer sslmode des query params
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    qs.pop("sslmode", None)          # ⭐ retirer sslmode
    qs.pop("sslcert", None)          # ⭐ retirer sslcert (non supporté)
    qs.pop("sslkey", None)
    qs.pop("sslrootcert", None)
    qs.pop("sslcrl", None)
    new_query = urlencode(qs, doseq=True)
    return urlunparse(parsed._replace(query=new_query))

ASYNC_DATABASE_URL = _clean_url_for_asyncpg(DATABASE_URL)

# ⭐ Config Supabase-safe : pool réduit + SSL via connect_args
engine = create_async_engine(
    ASYNC_DATABASE_URL,
    pool_size=3,
    max_overflow=2,
    pool_timeout=30,
    pool_recycle=300,
    pool_pre_ping=True,
    echo=False,
    connect_args={
        "statement_cache_size": 0,   # OBLIGATOIRE pour PgBouncer transaction mode
        "command_timeout": 30,
        "ssl": "require",            # ⭐ asyncpg : 'ssl' au lieu de 'sslmode'
        "server_settings": {
            "application_name": "strykos-api",
            "jit": "off",
        },
    },
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()