"""
Sign-in, 2-step verification, sessions and passwords for Sentinel, Setu
and Nayan. The contract the three apps follow is summarised in the README
("Security"). Rules worth knowing:

- Replies to a failed sign-in never reveal whether the email exists
  (same words, same timing, same lockout for unknown emails).
- Five failures for one email pause sign-in for that email for 15 minutes
  (423 + Retry-After), on top of the 5-per-minute limit per network.
- Every sign-in is a server-side session; tokens die with their session.
"""
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import Auth, get_auth
from app.core.rate_limit import limiter
from app.core.security import (burn_password_check, create_mfa_token,
                               decode_access_token, decrypt_secret,
                               encrypt_secret, hash_password,
                               hash_recovery_code, new_recovery_codes,
                               new_totp_secret, otpauth_uri,
                               password_problems, verify_password,
                               verify_totp)
from app.core.time import utcnow
from app.db.base import get_db
from app.db.models.auth_session import AuthSession
from app.db.models.user import ROLES, User
from app.schemas.auth import (ChangePasswordRequest, LoginRequest, MeOut,
                              MfaCode, MfaDisableRequest, MfaVerifyRequest,
                              PasswordOnly, RegisterRequest, SessionOut,
                              TokenResponse)
from app.services import audit, sessions

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
_optional_bearer = OAuth2PasswordBearer(tokenUrl="api/v1/auth/login", auto_error=False)


def _iso(d) -> str | None:
    return d.isoformat(timespec="seconds") if d else None


def _token_response(user: User, s: AuthSession, prev_login_at=None, prev_login_ip=None) -> TokenResponse:
    token, ttl = sessions.token_for(user, s)
    return TokenResponse(
        access_token=token,
        expires_in=ttl,
        idle_timeout=settings.SESSION_IDLE_MINUTES * 60,
        session_id=str(s.id),
        role=user.role,
        user_id=str(user.id),
        name=user.name,
        institute_id=str(user.institute_id) if user.institute_id else None,
        designation=user.designation,
        employee_id=user.employee_id,
        district=user.district,
        state=user.state,
        mfa_enabled=bool(user.mfa_enabled),
        last_login_at=_iso(prev_login_at),
        last_login_ip=prev_login_ip,
    )


def _complete_login(db: Session, user: User, request: Request, how: str) -> TokenResponse:
    prev_at, prev_ip = user.last_login_at, user.last_login_ip
    s = sessions.start(db, user, request)
    user.last_login_at, user.last_login_ip = s.created_at, s.ip
    db.commit()
    audit.record(db, user, action="auth.login", entity_type="user", entity_id=user.id, entity_label=user.name,
                 detail=f"Signed in as {user.role} ({how}) · {s.device}")
    return _token_response(user, s, prev_at, prev_ip)


def _locked(seconds: int) -> HTTPException:
    return HTTPException(status_code=423, detail=sessions.locked_message(seconds), headers={"Retry-After": str(seconds)})


def _failed_sign_in(db: Session, email: str, reason: str) -> HTTPException:
    left, locked = sessions.record_failure(db, email)
    audit.record(db, None, action="auth.login_failed", entity_type="user", entity_label=email[:200],
                 detail=reason + (" · sign-in paused" if locked else ""))
    if locked:
        return _locked(locked)
    msg = "Incorrect email or password."
    if left <= 2:
        msg += f" {left} attempt{'s' if left != 1 else ''} left before sign-in is paused for {settings.LOCKOUT_MINUTES} minutes."
    return HTTPException(status_code=401, detail=msg)


def _uuid(v) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(v))
    except (ValueError, TypeError):
        return None


def _find_user(db: Session, email: str) -> User | None:
    return db.query(User).filter(func.lower(User.email) == email).first()


# ---------------------------------------------------------------- sign-in


@router.post("/login")
@limiter.limit(settings.LOGIN_RATE_LIMIT)
def login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    wait = sessions.locked_for(db, email)
    if wait:
        raise _locked(wait)

    user = _find_user(db, email)
    if user is None:
        burn_password_check(payload.password)
        raise _failed_sign_in(db, email, "unknown account")
    if not verify_password(payload.password, user.password_hash):
        raise _failed_sign_in(db, email, "wrong password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account is disabled. Contact your administrator.")

    sessions.clear_failures(db, email)
    if user.mfa_enabled and user.mfa_secret_enc:
        return {"mfa_required": True, "mfa_token": create_mfa_token(str(user.id)), "expires_in": 300}
    return _complete_login(db, user, request, "password")


def _use_recovery_code(user: User, code: str) -> bool:
    h = hash_recovery_code(code)
    left = list(user.mfa_recovery_hashes or [])
    if h in left:
        left.remove(h)
        user.mfa_recovery_hashes = left
        return True
    return False


def _check_second_factor(user: User, code: str) -> bool:
    """TOTP code (no replay) or a single-use recovery code. Mutates the user
    (last step / remaining codes); the caller commits."""
    code = (code or "").strip()
    if re.fullmatch(r"[\d\s]{6,8}", code):
        secret = decrypt_secret(user.mfa_secret_enc)
        step = verify_totp(secret, code, user.mfa_last_step) if secret else None
        if step is not None:
            user.mfa_last_step = step
            return True
        return False
    return _use_recovery_code(user, code)


@router.post("/mfa/verify", response_model=TokenResponse)
@limiter.limit("10/minute")
def mfa_verify(request: Request, payload: MfaVerifyRequest, db: Session = Depends(get_db)):
    claims = decode_access_token(payload.mfa_token, typ="mfa")
    if claims is None:
        raise HTTPException(status_code=401, detail="Verification timed out. Please sign in again.")
    uid = _uuid(claims.get("sub"))
    user = db.get(User, uid) if uid else None
    if user is None or not user.mfa_enabled:
        raise HTTPException(status_code=401, detail="Verification timed out. Please sign in again.")
    email = user.email.lower()
    wait = sessions.locked_for(db, email)
    if wait:
        raise _locked(wait)
    if not _check_second_factor(user, payload.code):
        db.rollback()
        left, locked = sessions.record_failure(db, email)
        audit.record(db, user, action="auth.mfa_failed", entity_type="user", entity_id=user.id, entity_label=user.name,
                     detail="wrong code" + (" · sign-in paused" if locked else ""))
        if locked:
            raise _locked(locked)
        raise HTTPException(status_code=401, detail="Invalid code.")
    db.commit()
    sessions.clear_failures(db, email)
    return _complete_login(db, user, request, "2-step")


# ------------------------------------------------------------- sessions


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("30/minute")
def refresh(request: Request, auth: Auth = Depends(get_auth)):
    """A fresh access token for the same live session (the apps call this
    while the user is active, a few minutes before the token expires)."""
    return _token_response(auth.user, auth.session, None, None)


@router.post("/logout")
def logout(auth: Auth = Depends(get_auth), db: Session = Depends(get_db)):
    sessions.end(db, auth.session, "signed_out")
    audit.record(db, auth.user, action="auth.logout", entity_type="user", entity_id=auth.user.id, entity_label=auth.user.name,
                 detail=auth.session.device)
    return {"ok": True}


@router.post("/logout-others")
def logout_others(auth: Auth = Depends(get_auth), db: Session = Depends(get_db)):
    n = sessions.end_all(db, auth.user.id, except_id=auth.session.id)
    audit.record(db, auth.user, action="auth.sessions_revoked", entity_type="user", entity_id=auth.user.id,
                 entity_label=auth.user.name, detail=f"Signed out {n} other device(s)")
    return {"revoked": n}


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(auth: Auth = Depends(get_auth), db: Session = Depends(get_db)):
    return [
        SessionOut(id=str(s.id), created_at=_iso(s.created_at), last_seen_at=_iso(s.last_seen_at), expires_at=_iso(s.expires_at),
                   ip=s.ip, device=s.device, current=str(s.id) == str(auth.session.id))
        for s in sessions.live_for(db, auth.user.id)
    ]


@router.delete("/sessions/{session_id}")
def revoke_session(session_id: str, auth: Auth = Depends(get_auth), db: Session = Depends(get_db)):
    sid = _uuid(session_id)
    s = db.get(AuthSession, sid) if sid else None
    if s is None or str(s.user_id) != str(auth.user.id):
        raise HTTPException(status_code=404, detail="Session not found")
    sessions.end(db, s, "signed_out" if s.id == auth.session.id else "signed_out_elsewhere")
    audit.record(db, auth.user, action="auth.session_revoked", entity_type="user", entity_id=auth.user.id,
                 entity_label=auth.user.name, detail=s.device)
    return {"ok": True}


@router.get("/me", response_model=MeOut)
def me(auth: Auth = Depends(get_auth)):
    """The signed-in account, plus what the Security pages show."""
    user = auth.user
    return MeOut(
        user_id=str(user.id),
        name=user.name,
        email=user.email,
        role=user.role,
        institute_id=str(user.institute_id) if user.institute_id else None,
        designation=user.designation,
        employee_id=user.employee_id,
        district=user.district,
        state=user.state,
        mfa_enabled=bool(user.mfa_enabled),
        last_login_at=_iso(user.last_login_at),
        last_login_ip=user.last_login_ip,
        password_changed_at=_iso(user.password_changed_at),
        session_expires_at=_iso(auth.session.expires_at),
    )


# ------------------------------------------------------------- password


@router.post("/change-password")
@limiter.limit("5/minute")
def change_password(request: Request, payload: ChangePasswordRequest, auth: Auth = Depends(get_auth), db: Session = Depends(get_db)):
    user = auth.user
    if not verify_password(payload.current_password, user.password_hash):
        audit.record(db, user, action="auth.password_change_failed", entity_type="user", entity_id=user.id, entity_label=user.name,
                     detail="wrong current password")
        raise HTTPException(status_code=401, detail="Current password is incorrect.")
    if payload.new_password == payload.current_password:
        raise HTTPException(status_code=400, detail="Choose a password different from your current one.")
    problems = password_problems(payload.new_password, name=user.name, email=user.email)
    if problems:
        raise HTTPException(status_code=400, detail=" ".join(problems))
    user.password_hash = hash_password(payload.new_password)
    user.password_changed_at = utcnow()
    db.commit()
    n = sessions.end_all(db, user.id, except_id=auth.session.id, reason="password_changed")
    audit.record(db, user, action="auth.password_changed", entity_type="user", entity_id=user.id, entity_label=user.name,
                 detail=f"Other devices signed out: {n}")
    return {"ok": True, "revoked_other_sessions": n}


# ------------------------------------------------- 2-step verification


@router.post("/mfa/setup")
@limiter.limit("10/minute")
def mfa_setup(request: Request, payload: PasswordOnly, auth: Auth = Depends(get_auth), db: Session = Depends(get_db)):
    user = auth.user
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect password.")
    if user.mfa_enabled:
        raise HTTPException(status_code=409, detail="2-step verification is already on.")
    secret = new_totp_secret()
    user.mfa_secret_enc = encrypt_secret(secret)  # pending until /mfa/enable proves the app has it
    user.mfa_last_step = None
    db.commit()
    return {"secret": secret, "otpauth_uri": otpauth_uri(secret, user.email)}


@router.post("/mfa/enable")
@limiter.limit("10/minute")
def mfa_enable(request: Request, payload: MfaCode, auth: Auth = Depends(get_auth), db: Session = Depends(get_db)):
    user = auth.user
    if user.mfa_enabled:
        raise HTTPException(status_code=409, detail="2-step verification is already on.")
    secret = decrypt_secret(user.mfa_secret_enc)
    step = verify_totp(secret, payload.code) if secret else None
    if step is None:
        raise HTTPException(status_code=400, detail="Invalid code.")
    codes = new_recovery_codes()
    user.mfa_enabled = True
    user.mfa_last_step = step
    user.mfa_recovery_hashes = [hash_recovery_code(c) for c in codes]
    db.commit()
    audit.record(db, user, action="auth.mfa_enabled", entity_type="user", entity_id=user.id, entity_label=user.name)
    return {"enabled": True, "recovery_codes": codes}


@router.post("/mfa/disable")
@limiter.limit("10/minute")
def mfa_disable(request: Request, payload: MfaDisableRequest, auth: Auth = Depends(get_auth), db: Session = Depends(get_db)):
    user = auth.user
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect password.")
    if not user.mfa_enabled:
        return {"enabled": False}
    if not _check_second_factor(user, payload.code):
        db.rollback()
        raise HTTPException(status_code=400, detail="Invalid code.")
    user.mfa_enabled = False
    user.mfa_secret_enc = None
    user.mfa_recovery_hashes = None
    user.mfa_last_step = None
    db.commit()
    audit.record(db, user, action="auth.mfa_disabled", entity_type="user", entity_id=user.id, entity_label=user.name)
    return {"enabled": False}


# ------------------------------------------------------------- accounts


@router.post("/register", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(request: Request, payload: RegisterRequest, token: str | None = Depends(_optional_bearer),
             db: Session = Depends(get_db)):
    """Create an account. An admin may create any role. Without an admin
    token, only beneficiary self-sign-up, and only when ALLOW_PUBLIC_SIGNUP
    is on - nobody can mint themselves an official or admin account."""
    if payload.role not in ROLES:
        raise HTTPException(status_code=422, detail=f"role must be one of {ROLES}")

    creator: User | None = None
    if token:
        try:
            creator = get_auth(token, db).user
        except HTTPException:
            creator = None
    is_admin = creator is not None and creator.role == "admin"
    if not is_admin and not (settings.ALLOW_PUBLIC_SIGNUP and payload.role == "beneficiary"):
        raise HTTPException(status_code=403, detail="Accounts are created by an administrator.")

    email = payload.email.strip().lower()
    if _find_user(db, email):
        raise HTTPException(status_code=409, detail="A user with this email already exists")
    problems = password_problems(payload.password, name=payload.name, email=email)
    if problems:
        raise HTTPException(status_code=400, detail=" ".join(problems))

    user = User(
        name=payload.name,
        email=email,
        phone_number=payload.phone_number,
        password_hash=hash_password(payload.password),
        password_changed_at=utcnow(),
        role=payload.role,
        institute_id=payload.institute_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    audit.record(db, creator, action="user.created", entity_type="user", entity_id=user.id, entity_label=user.name,
                 detail=f"{user.role} · {'by admin' if is_admin else 'self sign-up'}")
    if is_admin:
        return {"user_id": str(user.id), "name": user.name, "email": user.email, "role": user.role}
    return _complete_login(db, user, request, "sign-up")
