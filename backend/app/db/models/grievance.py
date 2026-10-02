from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utcnow
from app.db.base import Base
from app.db.types import GUID, new_uuid

# Kept as plain strings (validated at the schema layer) so new statuses
# never require a migration - same pattern as User.role.
GRIEVANCE_STATUSES = ("open", "in_review", "resolved", "dismissed")


class Grievance(Base):
    __tablename__ = "grievances"

    id: Mapped[GUID] = mapped_column(GUID, primary_key=True, default=new_uuid)
    institute_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("institutes.id"), nullable=False)
    submitted_by_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("users.id"), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="open")
    created_at: Mapped[object] = mapped_column(DateTime, default=utcnow)
    # Setu's extra fields and Sentinel's escalation ladder (L1 district ->
    # L2 state -> L3 division), each level with its own SLA window.
    category: Mapped[str] = mapped_column(String(30), nullable=True)
    urgency: Mapped[str] = mapped_column(String(10), default="normal")
    confidential: Mapped[bool] = mapped_column(Boolean, default=False)
    escalation_level: Mapped[int] = mapped_column(Integer, default=1)
    escalated_at: Mapped[object] = mapped_column(DateTime, nullable=True)
    sla_due_at: Mapped[object] = mapped_column(DateTime, nullable=True)
    updates: Mapped[object] = mapped_column(JSON, nullable=True)  # [{at, text}] timeline shown in Setu

    institute = relationship("Institute")
    submitted_by = relationship("User")
