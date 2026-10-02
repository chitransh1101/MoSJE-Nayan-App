from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utcnow
from app.db.base import Base
from app.db.types import GUID, new_uuid


class Assignment(Base):
    __tablename__ = "assignments"

    id: Mapped[GUID] = mapped_column(GUID, primary_key=True, default=new_uuid)
    institute_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("institutes.id"), nullable=False)
    inspector_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("users.id"), nullable=False)
    random_seed_ref: Mapped[str] = mapped_column(String(64), nullable=False)  # audit reference, never the raw seed
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    geofence_triggered_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    notified_institute_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    # When the inspector should go (random, inside the working day), and how
    # far the visit has got: assigned -> in_progress -> submitted -> verified.
    dispatch_time: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(15), default="assigned")
    priority: Mapped[str] = mapped_column(String(10), default="normal")  # normal/urgent
    strategy: Mapped[str] = mapped_column(String(15), nullable=True)  # risk/uniform/engine
    seed_commitment: Mapped[str] = mapped_column(String(64), nullable=True)  # SHA-256 of a client-side draw seed
    instructions: Mapped[object] = mapped_column(JSON, nullable=True)  # list of strings from the official

    institute = relationship("Institute", back_populates="assignments")
    inspector = relationship("User")
    evidence = relationship("Evidence", back_populates="assignment")
