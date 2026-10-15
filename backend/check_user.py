"""Script de diagnostic : vérifie l'état d'un utilisateur."""
import asyncio
import os
import sys
from dotenv import load_dotenv

load_dotenv()

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text


async def check(email: str):
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("❌ DATABASE_URL non défini dans .env")
        return
    
    # Convertir postgres:// en postgresql+asyncpg:// si besoin
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    
    engine = create_async_engine(url)
    async with engine.connect() as conn:
        # Tous les users avec cet email (au cas où doublon)
        r = await conn.execute(
            text("SELECT id, email, email_verified, created_at FROM profiles WHERE email = :email"),
            {"email": email}
        )
        rows = list(r)
        if not rows:
            print(f"❌ Aucun utilisateur avec l'email : {email}")
        else:
            print(f"✅ {len(rows)} utilisateur(s) trouvé(s) :")
            for row in rows:
                print(f"   ID       : {row[0]}")
                print(f"   Email    : {row[1]}")
                print(f"   Vérifié  : {row[2]}")
                print(f"   Créé le  : {row[3]}")
                print()
    
    await engine.dispose()


if __name__ == "__main__":
    email = sys.argv[1] if len(sys.argv) > 1 else "salifkane726@gmail.com"
    asyncio.run(check(email))