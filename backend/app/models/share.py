from sqlalchemy import JSON, Boolean, Column, Float, ForeignKey, Integer, String

from backend.app.models.user import Base


class FileShare(Base):
    __tablename__ = "file_shares"
    id = Column(String, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String, nullable=False, unique=True)
    password_hash = Column(String, nullable=True)
    path = Column(String, nullable=False)
    identity = Column(JSON, nullable=False)
    access_version = Column(Integer, nullable=False)
    created_at = Column(Float, nullable=False)
    expires_at = Column(Float, nullable=False)
    revoked = Column(Boolean, nullable=False, default=False)
