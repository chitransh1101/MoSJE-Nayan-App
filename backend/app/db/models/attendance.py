from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utcnow
from app.db.base import Base
from app.db.types import GUID, new_uuid


class AttendanceEvent(Base):
    __tablename__ = "attendance_events"

    id: Mapped[GUID] = mapped_column(GUID, primary_key=True, default=new_uuid)
    institute_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("institutes.id"), nullable=False)
    user_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("users.id"), nullable=False)
    method: Mapped[str] = mapped_column(String(20), default="face_match")  # face_match/biometric/geo
    confidence_score: Mapped[float] = mapped_column(Numeric(5, 4), nullable=True)
    cctv_cross_check: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    institute = relationship("Institute")
    user = relationship("User")
