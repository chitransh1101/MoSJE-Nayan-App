"""
Password hashing, tokens, 2-step verification and the password policy.
Kept isolated from route handlers so the schemes can change without
touching any endpoint code.
"""
import base64
import hashlib
import hmac
import re
import secrets
import struct
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ------------------------------------------------------------------ passwords


def hash_password(plain_password: str) -> str:
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except (ValueError, TypeError):
        return False


_DUMMY_HASH: str | None = None


def burn_password_check(plain_password: str) -> None:
    """Spend the same time as a real bcrypt check, for unknown emails, so
    response timing doesn't reveal which accounts exist."""
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = pwd_context.hash(secrets.token_urlsafe(16))
    verify_password(plain_password, _DUMMY_HASH)


COMMON_PASSWORDS = {
    "password", "password1", "password123", "password@123", "passw0rd", "123456", "12345678",
    "123456789", "1234567890", "qwerty", "qwerty123", "qwertyuiop", "abc123", "111111", "000000",
    "iloveyou", "admin", "admin123", "admin@123", "welcome", "welcome1", "welcome@123", "letmein",
    "india123", "india@123", "bharat123", "changeme", "default", "secret", "login", "master",
    "sunshine", "princess", "dragon", "monkey", "football", "baseball", "superman", "trustno1",
}


def password_problems(password: str, *, name: str = "", email: str = "") -> list[str]:
    """Every rule the password breaks, as short sentences (empty = fine).
    The apps show the same rules as a live checklist."""
    p = password or ""
    out = []
    if len(p) < 12:
        out.append("Use at least 12 characters.")
    if len(p) > 128:
        out.append("Use at most 128 characters.")
    if not re.search(r"[A-Z]", p):
        out.append("Add an uppercase letter.")
    if not re.search(r"[a-z]", p):
        out.append("Add a lowercase letter.")
    if not re.search(r"\d", p):
        out.append("Add a number.")
    if not re.search(r"[^A-Za-z0-9]", p):
        out.append("Add a symbol such as ! @ # $.")
    low = p.lower()
    local = (email or "").split("@")[0].lower()
    parts = [w for w in re.split(r"[^a-z]+", (name or "").lower()) if len(w) >= 3]
    if (local and len(local) >= 3 and local in low) or any(w in low for w in parts):
        out.append("Don't use your name or email in the password.")
    stripped = re.sub(r"[^a-z0-9@]", "", low)
    if low in COMMON_PASSWORDS or stripped in COMMON_PASSWORDS or re.sub(r"\d+$", "", stripped) in COMMON_PASSWORDS:
        out.append("This password is too common. Choose something less guessable.")
    return out


# --------------------------------------------------------------------- tokens


def create_access_token(subject: str, role: str, extra_claims: dict[str, Any] | None = None,
                        sid: str | None = None, expires_at: datetime | None = None) -> str:
    """subject = user id. `sid` names the server-side session the token
    belongs to (app/core/deps.py rejects tokens whose session is over).
    `expires_at` (naive UTC) caps the token at the session's own expiry."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    if expires_at is not None:
        expire = min(expire, expires_at.replace(tzinfo=timezone.utc))
    to_encode = {"sub": subject, "role": role, "typ": "access", "iat": now, "exp": expire, "jti": uuid.uuid4().hex}
    if sid:
        to_encode["sid"] = sid
    if extra_claims:
        to_encode.update(extra_claims)
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def token_seconds_left(token: str) -> int:
    payload = decode_access_token(token, typ=None) or {}
    return max(0, int(payload.get("exp", 0) - time.time()))


def create_mfa_token(user_id: str) -> str:
    """Proof that the password step passed; good for 5 minutes, only at /auth/mfa/verify."""
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": user_id, "typ": "mfa", "iat": now, "exp": now + timedelta(minutes=5), "jti": uuid.uuid4().hex},
                      settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str, typ: str | None = "access") -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None
    if typ is not None and payload.get("typ", "access") != typ:
        return None
    return payload


# --------------------------------------------------- 2-step verification (TOTP)
# RFC 6238, 6 digits, 30 s, SHA-1 - what every authenticator app speaks.

TOTP_STEP = 30


def new_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _totp_at(secret: str, step: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8), casefold=True)
    digest = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1_000_000
    return f"{code:06d}"


def totp_now(secret: str, at: float | None = None) -> str:
    return _totp_at(secret, int((at if at is not None else time.time()) // TOTP_STEP))


def verify_totp(secret: str, code: str, last_step: int | None = None, at: float | None = None) -> int | None:
    """The matching time-step (±1 step of clock drift), or None. A step at or
    before `last_step` is refused, so a code can't be replayed."""
    code = re.sub(r"\s", "", code or "")
    if not re.fullmatch(r"\d{6}", code):
        return None
    now_step = int((at if at is not None else time.time()) // TOTP_STEP)
    for step in (now_step - 1, now_step, now_step + 1):
        if last_step is not None and step <= last_step:
            continue
        if hmac.compare_digest(_totp_at(secret, step), code):
            return step
    return None


def otpauth_uri(secret: str, email: str) -> str:
    from urllib.parse import quote
    issuer = settings.MFA_ISSUER
    return f"otpauth://totp/{quote(issuer)}:{quote(email)}?secret={secret}&issuer={quote(issuer)}&algorithm=SHA1&digits=6&period={TOTP_STEP}"


def _fernet() -> Fernet:
    # Derived from the signing secret, so rotating JWT_SECRET_KEY also
    # requires users to set up 2-step verification again.
    key = base64.urlsafe_b64encode(hashlib.sha256(("mfa-at-rest:" + settings.JWT_SECRET_KEY).encode()).digest())
    return Fernet(key)


def encrypt_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def decrypt_secret(token: str | None) -> str | None:
    if not token:
        return None
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return None


_RC_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I


def new_recovery_codes(n: int = 10) -> list[str]:
    def one() -> str:
        raw = "".join(secrets.choice(_RC_ALPHABET) for _ in range(8))
        return f"{raw[:4]}-{raw[4:]}"
    return [one() for _ in range(n)]


def hash_recovery_code(code: str) -> str:
    norm = re.sub(r"[^A-Z0-9]", "", (code or "").upper())
    return hashlib.sha256(("rc:" + norm).encode()).hexdigest()
