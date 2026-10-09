from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import Profile, UserAddress
from auth import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterInput(BaseModel):
    email: EmailStr
    password: str
    first_name: str = ""
    last_name: str = ""
    phone: str = ""


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class ProfileUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    preferred_language: str | None = None


def _auth_response(user: Profile, response: Response):
    token = create_access_token(user.id, user.email, user.role)
    response.set_cookie("access_token", token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    return {"token": token, "user": user.to_dict()}


@router.post("/register")
async def register(data: RegisterInput, response: Response, db: AsyncSession = Depends(get_db)):
    email = data.email.lower().strip()
    existing = await db.execute(select(Profile).where(Profile.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Un compte existe deja avec cet e-mail")
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 6 caracteres")
    user = Profile(
        email=email, password_hash=hash_password(data.password),
        first_name=data.first_name, last_name=data.last_name, phone=data.phone,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return _auth_response(user, response)


@router.post("/login")
async def login(data: LoginInput, response: Response, db: AsyncSession = Depends(get_db)):
    email = data.email.lower().strip()
    result = await db.execute(select(Profile).where(Profile.email == email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="E-mail ou mot de passe incorrect")
    return _auth_response(user, response)


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@router.get("/me")
async def me(user: Profile = Depends(get_current_user)):
    return user.to_dict()


@router.put("/me")
async def update_me(data: ProfileUpdate, user: Profile = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    for field in ["first_name", "last_name", "phone", "preferred_language"]:
        val = getattr(data, field)
        if val is not None:
            setattr(user, field, val)
    await db.commit()
    await db.refresh(user)
    return user.to_dict()


# ---- Addresses ----
class AddressInput(BaseModel):
    label: str = ""
    first_name: str = ""
    last_name: str = ""
    phone: str = ""
    country: str = ""
    city: str = ""
    address_line: str = ""
    postal_code: str = ""
    is_default: bool = False


@router.get("/addresses")
async def list_addresses(user: Profile = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserAddress).where(UserAddress.user_id == user.id))
    return [a.to_dict() for a in result.scalars().all()]


@router.post("/addresses")
async def add_address(data: AddressInput, user: Profile = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    addr = UserAddress(user_id=user.id, **data.model_dump())
    db.add(addr)
    await db.commit()
    await db.refresh(addr)
    return addr.to_dict()


@router.delete("/addresses/{address_id}")
async def delete_address(address_id: str, user: Profile = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserAddress).where(UserAddress.id == address_id, UserAddress.user_id == user.id))
    addr = result.scalar_one_or_none()
    if not addr:
        raise HTTPException(status_code=404, detail="Adresse introuvable")
    await db.delete(addr)
    await db.commit()
    return {"ok": True}
