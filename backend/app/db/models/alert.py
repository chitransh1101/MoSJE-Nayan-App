from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utcnow
from app.db.base import Base
from app.db.types import GUID, new_uuid


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[GUID] = mapped_column(GUID, primary_key=True, default=new_uuid)
    institute_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("institutes.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(30), nullable=False)  # attendance_spike/feed_drop/vc_miss/video_tamper
    severity: Mapped[str] = mapped_column(String(10), nullable=False)  # yellow/red
    status: Mapped[str] = mapped_column(String(15), default="open")  # open/reviewed/escalated/closed
    detail: Mapped[str] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    institute = relationship("Institute", back_populates="alerts")
