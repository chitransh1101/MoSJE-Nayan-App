from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utcnow
from app.db.base import Base
from app.db.types import GUID, new_uuid


class Evidence(Base):
    __tablename__ = "evidence"

    id: Mapped[GUID] = mapped_column(GUID, primary_key=True, default=new_uuid)
    assignment_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("assignments.id"), nullable=False)
    file_url: Mapped[str] = mapped_column(String(500), nullable=False)
    sha256_hash: Mapped[str] = mapped_column(String(64), nullable=False)  # verified server-side at upload
    gps_lat: Mapped[float] = mapped_column(Float, nullable=False)
    gps_lng: Mapped[float] = mapped_column(Float, nullable=False)
    device_id: Mapped[str] = mapped_column(String(255), nullable=False)
    captured_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    kind: Mapped[str] = mapped_column(String(10), default="photo")  # photo/video
    distance_m: Mapped[float] = mapped_column(Float, nullable=True)  # from the institute, at capture

    assignment = relationship("Assignment", back_populates="evidence")
