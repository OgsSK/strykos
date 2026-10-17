import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from sqlalchemy.pool import NullPool  # ⭐ IMPORTANT

load_dotenv(Path(__file__).parent / '.env')

DATABASE_URL = os.environ['DATABASE_URL']

def _clean_url_for_asyncpg(url: str) -> str:
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)

    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    
    # ⭐ ON AJOUTE CECI POUR FORCER LA DÉSACTIVATION DU CACHE
    qs["prepared_statement_cache_size"] = ["0"] 
    
    qs.pop("sslmode", None)
    qs.pop("sslcert", None)
    qs.pop("sslkey", None)
    qs.pop("sslrootcert", None)
    qs.pop("sslcrl", None)
    
    new_query = urlencode(qs, doseq=True)
    return urlunparse(parsed._replace(query=new_query))

ASYNC_DATABASE_URL = _clean_url_for_asyncpg(DATABASE_URL)

# ⭐ CONFIGURATION CRUCIALE POUR SUPABASE (PgBouncer)
engine = create_async_engine(
    ASYNC_DATABASE_URL,
    poolclass=NullPool,  # ⭐ CRUCIAL : PgBouncer de Supabase gère déjà le pool. 
                         # Si SQLAlchemy gère son propre pool en même temps, ça fait des conflits et ça plante.
    echo=False,
    connect_args={
        "statement_cache_size": 0, # On désactive le cache côté driver
        "command_timeout": 30,
        "ssl": "require",
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