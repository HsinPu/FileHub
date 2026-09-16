import time

from sqlalchemy import Boolean, Column, Float, Integer, String

from backend.app.models.user import Base


class Directory(Base):
    __tablename__ = "directories"
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    path = Column(String, nullable=False)
    path_key = Column(String, nullable=False, unique=True)
    enabled = Column(Boolean, nullable=False, default=True)
    revision = Column(Integer, nullable=False, default=1)
    access_revision = Column(Integer, nullable=False, default=1)
    created_at = Column(Float, nullable=False, default=time.time)
    updated_at = Column(Float, nullable=False, default=time.time)


class DirectoryRegistryState(Base):
    __tablename__ = "directory_registry_state"
    id = Column(Integer, primary_key=True)
    legacy_imported = Column(Boolean, nullable=False, default=False)
