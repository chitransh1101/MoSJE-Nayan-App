from datetime import timedelta

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_role
from app.core.scope import in_scope, institute_ids_in_scope
from app.core.time import utcnow
from app.db.base import get_db
from app.db.models.grievance import GRIEVANCE_STATUSES, Grievance
from app.db.models.institute import Institute
from app.db.models.user import User
from app.schemas.grievance import (GrievanceCreate, GrievanceEscalate,
                                   GrievanceOut, GrievanceStatusUpdate)
from app.services import audit

router = APIRouter(prefix="/api/v1/grievances", tags=["grievances"])

SLA_DAYS = 21  # each escalation level gets a fresh 21-day window
LEVEL_NAMES = {1: "District Social Welfare Officer", 2: "State Directorate", 3: "DoSJE Division"}


def _add_update(g: Grievance, text: str) -> None:
    items = list(g.updates or [])
    items.append({"at": utcnow().isoformat(timespec="seconds"), "text": text})
    g.updates = items


@router.post("", response_model=GrievanceOut, status_code=201)
def submit_grievance(
    payload: GrievanceCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("institute_staff", "beneficiary")),
):
    # A grievance can only ever be filed against the submitter's OWN
    # institute - never on behalf of another institute they have no
    # connection to.
    if str(user.institute_id) != str(payload.institute_id):
        raise HTTPException(status_code=403, detail="You can only submit a grievance for your own institute")

    now = utcnow()
    grievance = Grievance(
        institute_id=payload.institute_id,
        submitted_by_id=user.id,
        subject=payload.subject,
        description=payload.description,
        category=payload.category,
        urgency=payload.urgency or "normal",
        confidential=bool(payload.confidential),
        escalation_level=1,
        sla_due_at=now + timedelta(days=SLA_DAYS),
        updates=[{"at": now.isoformat(timespec="seconds"), "text": "Received by the Ministry and logged in Sentinel."}],
    )
    db.add(grievance)
    db.commit()
    db.refresh(grievance)
    audit.record(db, user, action="grievance.created", entity_type="grievance", entity_id=grievance.id,
                 entity_label=grievance.subject[:120], detail=f"{grievance.category or 'general'} · {grievance.urgency}")
    return grievance


@router.get("", response_model=list[GrievanceOut])
def list_grievances(
    request: Request,
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Grievance)
    if user.role in ("official", "admin", "district_authority", "state_authority"):
        pass  # filtered by area below
    elif user.role == "institute_staff":
        q = q.filter(Grievance.institute_id == user.institute_id)  # own institute only, regardless of query params
    elif user.role == "beneficiary":
        # own institute only; confidential complaints by others stay hidden
        q = q.filter(Grievance.institute_id == user.institute_id)
    else:
        raise HTTPException(status_code=403, detail="Not permitted to view grievances")

    if status:
        q = q.filter(Grievance.status == status)
    rows = q.order_by(Grievance.created_at.desc()).all()
    if user.role == "beneficiary":
        rows = [g for g in rows if not g.confidential or str(g.submitted_by_id) == str(user.id)]
    elif user.role != "institute_staff":
        scope = institute_ids_in_scope(db, user, request)
        rows = [g for g in rows if in_scope(scope, g.institute_id)]
    return rows


@router.patch("/{grievance_id}/status", response_model=GrievanceOut)
def update_grievance_status(
    grievance_id: str,
    payload: GrievanceStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("official", "admin", "district_authority", "state_authority")),
):
    if payload.status not in GRIEVANCE_STATUSES:
        raise HTTPException(status_code=422, detail=f"status must be one of {GRIEVANCE_STATUSES}")

    grievance = db.get(Grievance, grievance_id)
    if not grievance:
        raise HTTPException(status_code=404, detail="Grievance not found")

    before = grievance.status
    grievance.status = payload.status
    _add_update(grievance, {
        "in_review": "Assigned to the District Social Welfare Officer.",
        "resolved": "Resolved. Please tell us if the problem comes back.",
        "dismissed": "Closed by the Department.",
        "open": "Re-opened.",
    }.get(payload.status, f"Status changed to {payload.status}."))
    db.commit()
    db.refresh(grievance)
    audit.record(db, user, action=f"grievance.{payload.status}", entity_type="grievance", entity_id=grievance.id,
                 entity_label=grievance.subject[:120], detail=f"{before} → {payload.status}",
                 before={"status": before}, after={"status": payload.status})
    return grievance


@router.post("/{grievance_id}/escalate", response_model=GrievanceOut)
def escalate_grievance(
    grievance_id: str,
    payload: GrievanceEscalate | None = Body(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_role("official", "admin", "district_authority", "state_authority")),
):
    """Moves a grievance up one level (L1 district -> L2 state -> L3 division)
    and starts a fresh SLA window. 409 if already at L3 or resolved."""
    g = db.get(Grievance, grievance_id)
    if not g:
        raise HTTPException(status_code=404, detail="Grievance not found")
    level = g.escalation_level or 1
    if g.status in ("resolved", "dismissed") or level >= 3:
        raise HTTPException(status_code=409, detail="Grievance cannot be escalated further")
    now = utcnow()
    g.escalation_level = level + 1
    g.escalated_at = now
    g.sla_due_at = now + timedelta(days=SLA_DAYS)
    if g.status == "open":
        g.status = "in_review"
    reason = (payload.reason if payload else None) or ""
    _add_update(g, f"Escalated to the {LEVEL_NAMES[level + 1]} for action." + (f" Reason: {reason}" if reason else ""))
    db.commit()
    db.refresh(g)
    inst = db.get(Institute, g.institute_id)
    audit.record(db, user, action="grievance.escalated", entity_type="grievance", entity_id=g.id,
                 entity_label=g.subject[:120], detail=f"L{level} → L{level + 1} · {inst.name if inst else ''}")
    return g
