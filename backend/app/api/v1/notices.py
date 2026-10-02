from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_role
from app.db.base import get_db
from app.db.models.extras import Notice
from app.db.models.user import User
from app.services import audit

router = APIRouter(prefix="/api/v1/notices", tags=["notices"])


class NoticeIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    body: str = Field(min_length=3, max_length=4000)
    audience: str = Field(default="all", pattern="^(all|staff|beneficiary)$")
    institute_id: str | None = None


def view(n: Notice) -> dict:
    return {"id": n.id, "title": n.title, "body": n.body, "audience": n.audience, "institute_id": n.institute_id,
            "created_at": n.created_at.isoformat()}


@router.get("")
def list_notices(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(Notice)
    if user.role in ("institute_staff", "beneficiary"):
        aud = "staff" if user.role == "institute_staff" else "beneficiary"
        q = q.filter(Notice.audience.in_(("all", aud)))
        q = q.filter(or_(Notice.institute_id.is_(None), Notice.institute_id == user.institute_id))
    return [view(n) for n in q.order_by(Notice.created_at.desc()).limit(100).all()]


@router.post("", status_code=201)
def create_notice(payload: NoticeIn, db: Session = Depends(get_db), user: User = Depends(require_role("official", "admin"))):
    n = Notice(title=payload.title, body=payload.body, audience=payload.audience, institute_id=payload.institute_id)
    db.add(n)
    db.commit()
    db.refresh(n)
    audit.record(db, user, action="notice.published", entity_type="notice", entity_id=n.id, entity_label=n.title)
    return view(n)
