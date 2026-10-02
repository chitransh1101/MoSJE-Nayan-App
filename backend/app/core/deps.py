"""
Dependencies behind every protected route:
  - get_auth: decodes the JWT, checks its server-side session is still live
    (not signed out, not idle, not expired), loads the user - 401 otherwise
  - get_current_user: the signed-in User
  - require_role(*roles): 403 if the user's role isn't in the allowed set

A route declares its access rule in its signature -
`user: User = Depends(require_role("official"))` - so RBAC is visible at
the endpoint definition, not buried in an if-statement inside the body.
"""
import uuid
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.base import get_db
from app.db.models.auth_session import AuthSession
from app.db.models.user import User
from app.services import sessions

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/login")


@dataclass
class Auth:
    user: User
    session: AuthSession


def _unauthorized(detail: str = "Could not validate credentials") -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail,
                         headers={"WWW-Authenticate": "Bearer"})


def get_auth(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Auth:
    payload = decode_access_token(token)
    if payload is None:
        raise _unauthorized("Session expired. Please sign in again.")
    try:
        user_id = uuid.UUID(str(payload.get("sub")))
        sid = uuid.UUID(str(payload.get("sid")))
    except (ValueError, TypeError):
        raise _unauthorized()

    s = db.get(AuthSession, sid)
    if s is not None and str(s.user_id) != str(user_id):
        raise _unauthorized()
    dead = sessions.why_dead(s)
    if dead:
        raise _unauthorized(dead)

    user = db.get(User, user_id)
    if user is None:
        raise _unauthorized()
    if not user.is_active:
        sessions.end(db, s, "account_disabled")
        raise _unauthorized("This account is disabled. Contact your administrator.")
    sessions.touch(db, s)
    return Auth(user=user, session=s)


def get_current_user(auth: Auth = Depends(get_auth)) -> User:
    return auth.user


def require_role(*allowed_roles: str):
    def _guard(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user.role}' is not permitted to perform this action",
            )
        return user

    return _guard
