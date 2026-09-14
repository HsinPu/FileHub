import time

from sqlalchemy import JSON, Boolean, Column, Float, ForeignKey, Integer, String

from backend.app.models.user import Base

PERMISSIONS = ["browse", "read", "upload", "modify", "delete", "share"]


class AccountAccess(Base):
    __tablename__ = "account_access"
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    role = Column(String, nullable=False, default="user")
    enabled = Column(Boolean, nullable=False, default=False)
    root = Column(String, nullable=True)
    permissions = Column(JSON, nullable=False, default=list)
    must_change_password = Column(Boolean, nullable=False, default=True)
    version = Column(Integer, nullable=False, default=1)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id = Column(Integer, primary_key=True)
    actor_id = Column(Integer, nullable=False)
    target_id = Column(Integer, nullable=True)
    action = Column(String, nullable=False)
    created_at = Column(Float, nullable=False, default=time.time)
