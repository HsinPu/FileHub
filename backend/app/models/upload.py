from sqlalchemy import JSON, Column, ForeignKey, Integer, String

from backend.app.models.user import Base


class UploadBatch(Base):
    __tablename__ = "upload_batches"
    id = Column(String, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    payload = Column(String, nullable=False)
    status = Column(String, nullable=False)
    entries = Column(JSON, nullable=False)
