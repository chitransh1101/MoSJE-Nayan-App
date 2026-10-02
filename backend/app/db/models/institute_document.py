from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utcnow
from app.db.base import Base
from app.db.types import GUID, new_uuid


class InstituteDocument(Base):
    """
    A document an institute uploads in response to a finding (or
    proactively, e.g. for a renewal) - separate from Evidence, which is
    always inspector-captured and hash-verified. This is institute-
    submitted, so it's tracked distinctly rather than conflated with the
    tamper-evident inspector evidence chain.
    """
    __tablename__ = "institute_documents"

    id: Mapped[GUID] = mapped_column(GUID, primary_key=True, default=new_uuid)
    institute_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("institutes.id"), nullable=False)
    alert_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("alerts.id"), nullable=True)  # null if not tied to a specific finding
    uploaded_by_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("users.id"), nullable=False)
    file_url: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=True)
    uploaded_at: Mapped[object] = mapped_column(DateTime, default=utcnow)

    institute = relationship("Institute")
    alert = relationship("Alert")
    uploaded_by = relationship("User")
