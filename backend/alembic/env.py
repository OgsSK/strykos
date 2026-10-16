import os
from pathlib import Path
from logging.config import fileConfig
from dotenv import load_dotenv
from sqlalchemy import create_engine, pool
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from alembic import context

load_dotenv(Path(__file__).parent.parent / '.env')

import models  # noqa: F401
from database import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _to_psycopg2_url(url: str) -> str:
    """
    ⭐ Convertit N'IMPORTE QUELLE URL Postgres en URL psycopg2 (sync).
    Gère : postgres://, postgresql://, postgresql+asyncpg://, postgresql+psycopg2://
    """
    # Forcer psycopg2 selon le préfixe
    if url.startswith("postgresql+asyncpg://"):
        url = url.replace("postgresql+asyncpg://", "postgresql+psycopg2://", 1)
    elif url.startswith("postgresql+psycopg2://"):
        pass  # déjà bon
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg2://", 1)

    # Retirer sslmode/sslcert de l'URL (on le passe via connect_args)
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    for key in ("sslmode", "sslcert", "sslkey", "sslrootcert", "sslcrl"):
        qs.pop(key, None)
    new_query = urlencode(qs, doseq=True)
    return urlunparse(parsed._replace(query=new_query))


db_url = _to_psycopg2_url(os.environ["DATABASE_URL"])
target_metadata = Base.metadata


def run_migrations_offline():
    context.configure(url=db_url, target_metadata=target_metadata,
                      literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connectable = create_engine(db_url, poolclass=pool.NullPool,
                                connect_args={"sslmode": "require"})
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()