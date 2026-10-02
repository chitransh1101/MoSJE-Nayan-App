"""Officials' directory of inspectors, and the message thread with each ("Connect with inspector")."""
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_role
from app.core.time import utcnow
from app.db.base import get_db
from app.db.models.assignment import Assignment
from app.db.models.extras import InspectorMessage
from app.db.models.user import User
from app.services import audit

router = APIRouter(prefix="/api/v1/inspectors", tags=["inspectors"])

OFFICIALS = ("official", "admin", "district_authority", "state_authority")


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    kind: str = Field(default="message", pattern="^(message|instruction|update_request)$")
    priority: str = Field(default="normal", pattern="^(normal|urgent)$")
    institute_id: str | None = None


def msg_view(m: InspectorMessage) -> dict:
    return {
        "id": m.id, "inspector_id": m.inspector_id, "direction": m.direction, "sender_name": m.sender_name,
        "body": m.body, "kind": m.kind, "priority": m.priority, "institute_id": m.institute_id,
        "status": m.status, "created_at": m.created_at.isoformat(),
    }


@router.get("")
def list_inspectors(db: Session = Depends(get_db), user: User = Depends(require_role(*OFFICIALS))):
    people = db.query(User).filter(User.role == "inspector").order_by(User.name).all()
    if user.role == "state_authority":
        people = [p for p in people if p.state == user.state]
    elif user.role == "district_authority":
        people = [p for p in people if p.district == user.district or p.state == user.state]
    now = utcnow()
    out = []
    for p in people:
        recent = (
            db.query(Assignment).filter(Assignment.inspector_id == p.id).order_by(Assignment.created_at.desc()).limit(6).all()
        )
        on_site = any(a.geofence_triggered_at and now - a.geofence_triggered_at < timedelta(hours=6) for a in recent)
        msgs = db.query(InspectorMessage).filter(InspectorMessage.inspector_id == p.id).order_by(InspectorMessage.created_at.desc()).all()
        last_seen = max([a.geofence_triggered_at for a in recent if a.geofence_triggered_at] + [m.created_at for m in msgs if m.direction == "from_inspector"], default=None)
        digits = "".join(ch for ch in (p.phone_number or "") if ch.isdigit())
        out.append({
            "id": p.id,
            "name": p.name,
            "designation": p.designation or "Inspector",
            "employee_id": p.employee_id,
            "district": p.district,
            "state": p.state,
            "status": "on_site" if on_site else ("available" if last_seen and now - last_seen < timedelta(hours=8) else "offline"),
            "last_seen_at": last_seen.isoformat() if last_seen else None,
            "assigned_institute_ids": list(dict.fromkeys(str(a.institute_id) for a in recent)),
            "phone_masked": f"+91 ••••• ••{digits[-3:]}" if len(digits) >= 3 else None,
            "unread": sum(1 for m in msgs if m.direction == "from_inspector" and m.status != "read"),
            "last_message": msg_view(msgs[0]) if msgs else None,
        })
    return out


@router.get("/{inspector_id}/messages")
def thread(inspector_id: str, institute_id: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == "inspector":
        if str(user.id) != str(inspector_id):
            raise HTTPException(status_code=403, detail="Not your thread")
    elif user.role not in OFFICIALS:
        raise HTTPException(status_code=403, detail="Not permitted")
    q = db.query(InspectorMessage).filter(InspectorMessage.inspector_id == inspector_id)
    if institute_id:
        q = q.filter(InspectorMessage.institute_id == institute_id)
    rows = q.order_by(InspectorMessage.created_at.asc()).all()
    if user.role == "inspector":
        # opening the thread on the phone acknowledges the official's messages
        for m in rows:
            if m.direction == "to_inspector" and m.status != "read":
                m.status = "read"
        db.commit()
    return [msg_view(m) for m in rows]


@router.post("/{inspector_id}/messages", status_code=201)
def send(inspector_id: str, payload: MessageIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    target = db.get(User, inspector_id)
    if not target or target.role != "inspector":
        raise HTTPException(status_code=404, detail="Inspector not found")
    if user.role == "inspector":
        if str(user.id) != str(inspector_id):
            raise HTTPException(status_code=403, detail="Not your thread")
        direction = "from_inspector"
    elif user.role in OFFICIALS:
        direction = "to_inspector"
    else:
        raise HTTPException(status_code=403, detail="Not permitted")
    m = InspectorMessage(
        inspector_id=target.id, direction=direction, sender_id=user.id, sender_name=user.name, body=payload.body,
        kind=payload.kind, priority=payload.priority, institute_id=payload.institute_id, status="sent",
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    audit.record(db, user, action="message.sent", entity_type="inspector", entity_id=target.id, entity_label=target.name,
                 detail=f"{payload.kind}/{payload.priority}")
    return msg_view(m)


@router.post("/{inspector_id}/messages/read")
def mark_read(inspector_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Officials acknowledge the inspector's messages; the inspector acknowledges the officials'."""
    if user.role == "inspector":
        if str(user.id) != str(inspector_id):
            raise HTTPException(status_code=403, detail="Not your thread")
        incoming = "to_inspector"
    elif user.role in OFFICIALS:
        incoming = "from_inspector"
    else:
        raise HTTPException(status_code=403, detail="Not permitted")
    rows = db.query(InspectorMessage).filter(
        InspectorMessage.inspector_id == inspector_id, InspectorMessage.direction == incoming, InspectorMessage.status != "read"
    ).all()
    for m in rows:
        m.status = "read"
    db.commit()
    return {"marked": len(rows)}
