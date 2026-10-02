from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import GUID, new_uuid

# Kept as plain strings (not a DB enum) so new roles never require a migration -
# validated instead at the Pydantic schema layer.
ROLES = (
    "admin", "institute_staff", "inspector", "official", "beneficiary",
    # Regional officials for Nayan's monitoring view - scoped to their
    # own district / state by app/core/scope.py.
    "district_authority", "state_authority",
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[GUID] = mapped_column(GUID, primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    phone_number: Mapped[str] = mapped_column(String(20), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(30), nullable=False)
    aadhaar_ekyc_ref: Mapped[str] = mapped_column(String(255), nullable=True)  # reference token only, never raw Aadhaar
    institute_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("institutes.id"), nullable=True)
    # Profile fields shown by Sentinel, Setu and Nayan (all optional).
    designation: Mapped[str] = mapped_column(String(120), nullable=True)
    employee_id: Mapped[str] = mapped_column(String(40), nullable=True)
    district: Mapped[str] = mapped_column(String(100), nullable=True)  # posting / jurisdiction
    state: Mapped[str] = mapped_column(String(100), nullable=True)
    # --- account security ---
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    password_changed_at: Mapped[object] = mapped_column(DateTime, nullable=True)
    last_login_at: Mapped[object] = mapped_column(DateTime, nullable=True)
    last_login_ip: Mapped[str] = mapped_column(String(64), nullable=True)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mfa_secret_enc: Mapped[str] = mapped_column(Text, nullable=True)  # TOTP secret, encrypted at rest
    mfa_recovery_hashes: Mapped[object] = mapped_column(JSON, nullable=True)  # SHA-256 of unused recovery codes
    mfa_last_step: Mapped[int] = mapped_column(Integer, nullable=True)  # last TOTP time-step used (no replay)

    institute = relationship("Institute", back_populates="users")
