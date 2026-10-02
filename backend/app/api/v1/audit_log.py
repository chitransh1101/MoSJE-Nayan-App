from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_role
from app.db.base import get_db
from app.db.models.extras import AuditEntry
from app.db.models.user import User
from app.services import audit

router = APIRouter(prefix="/api/v1/audit-log", tags=["audit"])


class AuditEventIn(BaseModel):
    """Client-side events the server can't see (e.g. a report downloaded)."""
    action: str = Field(max_length=60)
    entity_type: str | None = Field(default=None, max_length=30)
    entity_id: str | None = Field(default=None, max_length=64)
    entity_label: str | None = Field(default=None, max_length=200)
    detail: str | None = Field(default=None, max_length=2000)


def view(e: AuditEntry) -> dict:
    return {
        "id": e.id, "at": e.at, "actor_id": e.actor_id, "actor_name": e.actor_name, "actor_role": e.actor_role,
        "action": e.action, "entity_type": e.entity_type, "entity_id": e.entity_id, "entity_label": e.entity_label,
        "detail": e.detail, "before": e.before, "after": e.after, "prev_hash": e.prev_hash, "hash": e.hash,
    }


@router.get("")
def list_entries(limit: int = Query(default=500, ge=1, le=5000), db: Session = Depends(get_db),
                 _user: User = Depends(require_role("official", "admin"))):
    """Newest first. Each row's hash chains to the one before it."""
    rows = db.query(AuditEntry).order_by(AuditEntry.seq.desc()).limit(limit).all()
    return [view(e) for e in rows]


@router.post("/events", status_code=201)
def record_event(payload: AuditEventIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    e = audit.record(db, user, action=payload.action[:60], entity_type=payload.entity_type, entity_id=payload.entity_id,
                     entity_label=payload.entity_label, detail=payload.detail)
    return view(e)
