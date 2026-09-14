from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=1024)


class PasswordUpdate(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    new_password: str = Field(min_length=8, max_length=128)


class UserInfo(BaseModel):
    username: str
    full_name: str | None = None
    role: str
    permissions: list[str]
    must_change_password: bool


class Message(BaseModel):
    message: str
