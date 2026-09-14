from sqlalchemy import JSON, Boolean, Column, Float, ForeignKey, Integer, String, UniqueConstraint

from backend.app.models.user import Base


class SchemaMigration(Base):
    __tablename__ = "schema_migrations"
    version = Column(Integer, primary_key=True)


class Operation(Base):
    __tablename__ = "file_operations"
    __table_args__ = (UniqueConstraint("user_id", "request_id"),)
    id = Column(String, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    request_id = Column(String, nullable=False)
    payload = Column(String, nullable=False)
    kind = Column(String, nullable=False)
    destination = Column(String, nullable=True)
    conflict = Column(String, nullable=False)
    status = Column(String, nullable=False, index=True)
    cancel_requested = Column(Boolean, nullable=False, default=False)
    created_at = Column(Float, nullable=False)
    updated_at = Column(Float, nullable=False)
    items = Column(JSON, nullable=False)


class TrashItem(Base):
    __tablename__ = "trash_items"
    id = Column(String, primary_key=True)
    original_path = Column(String, nullable=False)
    kind = Column(String, nullable=False)
    deleted_by = Column(String, nullable=False)
    deleted_at = Column(Float, nullable=False)
    status = Column(String, nullable=False, index=True)
    source_identity = Column(JSON, nullable=False)
    restore_target = Column(String, nullable=True)
