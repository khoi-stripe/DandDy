from pydantic import BaseModel, EmailStr
from models.user import UserRole

class UserBase(BaseModel):
    email: EmailStr
    username: str
    role: UserRole = UserRole.PLAYER

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(UserBase):
    id: int
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    user_id: int | None = None


