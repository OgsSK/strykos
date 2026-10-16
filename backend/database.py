import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base

load_dotenv(Path(__file__).parent / '.env')

DATABASE_URL = os.environ['DATABASE_URL']
ASYNC_DATABASE_URL = DATABASE_URL.replace('postgresql://', 'postgresql+asyncpg://')

# ⭐ FIX Supabase EMAXCONNSESSION :
# - pool_size réduit à 3 (au lieu de 10) → moins de connexions maintenues
# - max_overflow=2 → +2 en pic max
# - statement_cache_size=0 → OBLIGATOIRE pour le mode transaction (port 6543)
# - pool_recycle=300 → libère les connexions zombies après 5 min
engine = create_async_engine(
    ASYNC_DATABASE_URL,
    pool_size=3,                    # ⭐ 3 connexions persistantes
    max_overflow=2,                 # ⭐ +2 en pic = 5 max par worker
    pool_timeout=30,
    pool_recycle=300,               # ⭐ 5 min au lieu de 30 min
    pool_pre_ping=True,
    echo=False,
    connect_args={
        "statement_cache_size": 0,   # ⭐ OBLIGATOIRE pour PgBouncer transaction mode
        "command_timeout": 30,
        "server_settings": {
            "application_name": "strykos-api",
            "jit": "off",            # ⭐ Désactive JIT (plus rapide pour petites requêtes)
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