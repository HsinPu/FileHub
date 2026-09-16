from pydantic import BaseModel, ConfigDict, Field, field_validator


class DirectoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=100)
    path: str = Field(min_length=1, max_length=4096)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        value = value.strip()
        if not value or any(ord(char) < 32 for char in value):
            raise ValueError("請輸入單行目錄名稱。")
        return value


class DirectoryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=1)
    name: str | None = Field(default=None, min_length=1, max_length=100)
    enabled: bool | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        return DirectoryCreate.clean_name(value) if value is not None else value
