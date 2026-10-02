from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utcnow
from app.db.base import Base
from app.db.types import GUID, new_uuid


class VCCall(Base):
    __tablename__ = "vc_calls"

    id: Mapped[GUID] = mapped_column(GUID, primary_key=True, default=new_uuid)
    institute_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("institutes.id"), nullable=False)
    # Null when the person called isn't a registered user (e.g. staff picked
    # from the VC directory by name).
    beneficiary_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("users.id"), nullable=True)
    triggered_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    picked_up_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    recording_ref: Mapped[str] = mapped_column(String(255), nullable=True)
    # Random verification calls logged from Nayan / Sentinel.
    participant_name: Mapped[str] = mapped_column(String(120), nullable=True)
    participant_role: Mapped[str] = mapped_column(String(20), nullable=True)  # incharge/staff/beneficiary
    called_by_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("users.id"), nullable=True)
    called_by_name: Mapped[str] = mapped_column(String(120), nullable=True)
    room: Mapped[str] = mapped_column(String(80), nullable=True)
    outcome: Mapped[str] = mapped_column(String(20), default="pending")  # pending/connected/no_answer/wrong_person
    identity_ok: Mapped[bool] = mapped_column(Boolean, nullable=True)
    premises_shown: Mapped[bool] = mapped_column(Boolean, nullable=True)
    headcount: Mapped[int] = mapped_column(Integer, nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    is_random: Mapped[bool] = mapped_column(Boolean, default=True)
    # Scheduled well-being calls shown to beneficiaries in Setu.
    scheduled_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    official_name: Mapped[str] = mapped_column(String(160), nullable=True)

    institute = relationship("Institute")
    beneficiary = relationship("User", foreign_keys=[beneficiary_id])
