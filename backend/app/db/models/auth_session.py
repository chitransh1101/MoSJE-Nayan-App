"""
Server-side sign-in sessions and sign-in throttling.

Every access token names its session (`sid`). A token is only honoured
while its session is live: not signed out, not idle past
SESSION_IDLE_MINUTES, not past its absolute expiry. That is what makes
"sign out", "sign out other devices" and a password change take effect
immediately instead of whenever a stolen token happens to expire.
"""
from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import utcnow
from app.db.base import Base
from app.db.types import GUID, new_uuid


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[GUID] = mapped_column(GUID, primary_key=True, default=new_uuid)
    user_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("users.id"), nullable=False, index=True)
    created_at: Mapped[object] = mapped_column(DateTime, default=utcnow, nullable=False)
    last_seen_at: Mapped[object] = mapped_column(DateTime, default=utcnow, nullable=False)
    expires_at: Mapped[object] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[object] = mapped_column(DateTime, nullable=True)
    revoked_reason: Mapped[str] = mapped_column(String(40), nullable=True)
    ip: Mapped[str] = mapped_column(String(64), nullable=True)
    device: Mapped[str] = mapped_column(String(80), nullable=True)


class LoginThrottle(Base):
    """Failed sign-ins per email (lower-cased) - kept for unknown emails
    too, so the replies never reveal whether an account exists."""

    __tablename__ = "login_throttle"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    failures: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    first_failure_at: Mapped[object] = mapped_column(DateTime, nullable=True)
    locked_until: Mapped[object] = mapped_column(DateTime, nullable=True)
