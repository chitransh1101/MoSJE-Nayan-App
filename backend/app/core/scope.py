"""
Who may see which institutes.

    official / admin     every institute; Sentinel may narrow this with the
                         X-Sentinel-Region header (a State name, or "ALL")
    state_authority      institutes in the user's own state
    district_authority   institutes in the user's own district
    inspector            institutes the inspector has been assigned to
    institute_staff /    their own institute only
    beneficiary

`institute_ids_in_scope` returns None for "no restriction" so callers can
skip the filter entirely instead of building a huge IN (...) list.
"""
from fastapi import Request
from sqlalchemy.orm import Session

from app.db.models.assignment import Assignment
from app.db.models.institute import Institute
from app.db.models.user import User

OFFICIAL_ROLES = ("official", "admin", "district_authority", "state_authority")
MONITOR_ROLES = OFFICIAL_ROLES + ("inspector",)


def region_header(request: Request | None) -> str | None:
    if request is None:
        return None
    value = (request.headers.get("X-Sentinel-Region") or "").strip()
    return None if not value or value.upper() == "ALL" else value


def institute_ids_in_scope(db: Session, user: User, request: Request | None = None) -> set[str] | None:
    role = user.role
    if role in ("official", "admin"):
        region = region_header(request)
        if not region:
            return None
        return {i.id for i in db.query(Institute).filter(Institute.state == region).all()}
    if role == "state_authority":
        return {i.id for i in db.query(Institute).filter(Institute.state == (user.state or "")).all()}
    if role == "district_authority":
        return {i.id for i in db.query(Institute).filter(Institute.district == (user.district or "")).all()}
    if role == "inspector":
        rows = db.query(Assignment.institute_id).filter(Assignment.inspector_id == user.id).all()
        return {str(r[0]) for r in rows}
    if user.institute_id:
        return {str(user.institute_id)}
    return set()


def in_scope(scope: set[str] | None, institute_id) -> bool:
    return scope is None or str(institute_id) in scope
