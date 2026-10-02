"""
Sign-in sessions: create, renew, end, and the sign-in throttle.
Routes (app/api/v1/auth.py) stay thin; the rules live here.
"""
import re
from datetime import timedelta

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token
from app.core.time import utcnow
from app.db.models.auth_session import AuthSession, LoginThrottle
from app.db.models.user import User


def client_ip(request: Request) -> str:
    """The caller's address. Behind our nginx, X-Real-IP is set by nginx from
    the TCP peer (a client can't forge it); the last X-Forwarded-For hop is
    the fallback. Proxy headers are ignored unless TRUST_PROXY_HEADERS."""
    if settings.TRUST_PROXY_HEADERS:
        real = request.headers.get("x-real-ip", "").strip()
        fwd = request.headers.get("x-forwarded-for", "").split(",")[-1].strip()
        if real or fwd:
            return (real or fwd)[:64]
    return (request.client.host if request.client else "unknown")[:64]


def device_label(request: Request) -> str:
    """A short, human label for the session list: "Chrome on Windows",
    "Nayan app on Android", "Sentinel (web)"."""
    client = request.headers.get("x-client", "")
    ua = request.headers.get("user-agent", "")
    if client.startswith("nayan-"):
        platform = client.split("/")[0].removeprefix("nayan-").capitalize() or "phone"
        return f"Nayan app on {platform}"[:80]
    browser = next((b for b, pat in (("Edge", r"Edg/"), ("Opera", r"OPR/"), ("Chrome", r"Chrome/"),
                                     ("Firefox", r"Firefox/"), ("Safari", r"Safari/")) if re.search(pat, ua)), None)
    os_name = next((o for o, pat in (("Android", r"Android"), ("iPhone", r"iPhone|iPad"), ("Windows", r"Windows"),
                                     ("Mac", r"Mac OS X"), ("Linux", r"Linux")) if re.search(pat, ua)), None)
    app = {"sentinel": "Sentinel", "setu": "Setu"}.get(client.split("-")[0], "")
    label = " on ".join(x for x in (browser, os_name) if x) or (ua[:40] or "Unknown device")
    return (f"{label} · {app}" if app else label)[:80]


# ------------------------------------------------------------------ sessions


def start(db: Session, user: User, request: Request) -> AuthSession:
    now = utcnow()
    s = AuthSession(user_id=user.id, created_at=now, last_seen_at=now,
                    expires_at=now + timedelta(hours=settings.SESSION_MAX_HOURS),
                    ip=client_ip(request), device=device_label(request))
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def token_for(user: User, s: AuthSession) -> tuple[str, int]:
    token = create_access_token(subject=str(user.id), role=user.role, sid=str(s.id), expires_at=s.expires_at)
    ttl = int(min(settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, max(0, (s.expires_at - utcnow()).total_seconds())))
    return token, ttl


def why_dead(s: AuthSession | None) -> str | None:
    """None if the session is live, else the sentence the apps show."""
    now = utcnow()
    if s is None:
        return "Your session ended. Please sign in again."
    if s.revoked_at is not None:
        return {"password_changed": "Your password was changed. Please sign in again.",
                "signed_out_elsewhere": "You were signed out from another device.",
                "account_disabled": "This account is disabled. Contact your administrator."}.get(
            s.revoked_reason or "", "You have been signed out. Please sign in again.")
    if now >= s.expires_at:
        return "Session expired. Please sign in again."
    if now - s.last_seen_at > timedelta(minutes=settings.SESSION_IDLE_MINUTES):
        return "Signed out after a period of inactivity. Please sign in again."
    return None


def touch(db: Session, s: AuthSession) -> None:
    now = utcnow()
    if now - s.last_seen_at > timedelta(seconds=60):  # at most one write a minute
        s.last_seen_at = now
        db.commit()


def end(db: Session, s: AuthSession, reason: str = "signed_out") -> None:
    if s.revoked_at is None:
        s.revoked_at = utcnow()
        s.revoked_reason = reason
        db.commit()


def end_all(db: Session, user_id, *, except_id=None, reason: str = "signed_out_elsewhere") -> int:
    q = db.query(AuthSession).filter(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
    if except_id is not None:
        q = q.filter(AuthSession.id != except_id)
    rows = q.all()
    now = utcnow()
    for r in rows:
        r.revoked_at, r.revoked_reason = now, reason
    db.commit()
    return len(rows)


def live_for(db: Session, user_id) -> list[AuthSession]:
    rows = (db.query(AuthSession).filter(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
            .order_by(AuthSession.last_seen_at.desc()).all())
    return [r for r in rows if why_dead(r) is None]


# ------------------------------------------------------------------ throttle


def _key(email: str) -> str:
    return (email or "").strip().lower()[:255]


def locked_for(db: Session, email: str) -> int:
    """Seconds until sign-in is allowed again for this email (0 = allowed)."""
    t = db.get(LoginThrottle, _key(email))
    if t and t.locked_until:
        left = int((t.locked_until - utcnow()).total_seconds())
        if left > 0:
            return left
    return 0


def record_failure(db: Session, email: str) -> tuple[int, int]:
    """Counts a failed sign-in. Returns (attempts_left, locked_seconds)."""
    now = utcnow()
    k = _key(email)
    t = db.get(LoginThrottle, k)
    window = timedelta(minutes=settings.LOCKOUT_MINUTES)
    if t is None:
        t = LoginThrottle(key=k, failures=0)
        db.add(t)
    if t.first_failure_at is None or now - t.first_failure_at > window or (t.locked_until and t.locked_until <= now):
        t.failures, t.first_failure_at, t.locked_until = 0, now, None
    t.failures += 1
    locked = 0
    if t.failures >= settings.LOCKOUT_THRESHOLD:
        t.locked_until = now + window
        locked = int(window.total_seconds())
    db.commit()
    return max(0, settings.LOCKOUT_THRESHOLD - t.failures), locked


def clear_failures(db: Session, email: str) -> None:
    t = db.get(LoginThrottle, _key(email))
    if t:
        db.delete(t)
        db.commit()


def locked_message(seconds: int) -> str:
    minutes = max(1, -(-seconds // 60))
    return f"Too many failed sign-ins. Try again in {minutes} minute{'s' if minutes != 1 else ''}."
