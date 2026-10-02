"""
Video-conference verification calls.

    POST  /vc/trigger             admin: record a call placed to a beneficiary (original flow)
    PATCH /vc/{id}/status         admin: mark picked up
    GET   /vc/calls               officials / inspectors: the call log in their area
    POST  /vc/calls               officials / inspectors: log a random call (Nayan)
    PATCH /vc/calls/{id}          update the outcome after the call
    GET   /vc/calls/me            beneficiary: my calls (Setu)
    POST  /vc/calls/requests      beneficiary: ask the Department to call me (Setu)
    GET   /vc/directory           who can be called at an institute (Nayan's random pick)

The dial-out itself happens in a Jitsi-compatible room the client opens;
the server records who was called, by whom, and what was found. A call
that isn't answered (or reaches the wrong person) raises a vc_miss alert.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_role
from app.core.scope import MONITOR_ROLES, in_scope, institute_ids_in_scope
from app.core.time import utcnow
from app.db.base import get_db
from app.db.models.alert import Alert
from app.db.models.extras import BeneficiaryProfile, CallRequest
from app.db.models.institute import Institute
from app.db.models.user import User
from app.db.models.vc_call import VCCall
from app.services import audit

router = APIRouter(prefix="/api/v1/vc", tags=["vc"])


class VCTriggerRequest(BaseModel):
    institute_id: str
    beneficiary_id: str


class VCStatusRequest(BaseModel):
    picked_up: bool


class VCCallOut(BaseModel):
    id: str
    institute_id: str
    beneficiary_id: str | None
    triggered_at: datetime
    picked_up_at: datetime | None

    model_config = {"from_attributes": True}


class VCLogIn(BaseModel):
    institute_id: str
    participant_name: str = Field(max_length=120)
    participant_role: str = Field(default="beneficiary", pattern="^(incharge|staff|beneficiary)$")
    participant_id: str | None = None  # a registered user, if known
    outcome: str = Field(default="pending", pattern="^(pending|connected|no_answer|wrong_person)$")
    room: str | None = Field(default=None, max_length=80)
    identity_ok: bool | None = None
    premises_shown: bool | None = None
    headcount: int | None = Field(default=None, ge=0, le=5000)
    notes: str | None = Field(default=None, max_length=2000)
    random: bool = True
    started_at: datetime | None = None
    id: str | None = None  # client id - ignored, the server issues its own


class VCOutcomeIn(BaseModel):
    outcome: str = Field(pattern="^(pending|connected|no_answer|wrong_person)$")
    identity_ok: bool | None = None
    premises_shown: bool | None = None
    headcount: int | None = Field(default=None, ge=0, le=5000)
    notes: str | None = Field(default=None, max_length=2000)


class CallRequestIn(BaseModel):
    preferred_time: str | None = Field(default=None, max_length=60)
    note: str | None = Field(default=None, max_length=1000)


def call_view(db: Session, c: VCCall) -> dict:
    inst = db.get(Institute, c.institute_id)
    return {
        "id": c.id,
        "institute_id": c.institute_id,
        "institute_name": inst.name if inst else None,
        "participant_name": c.participant_name,
        "participant_role": c.participant_role or ("beneficiary" if c.beneficiary_id else None),
        "beneficiary_id": c.beneficiary_id,
        "started_at": c.triggered_at.isoformat() if c.triggered_at else None,
        "picked_up_at": c.picked_up_at.isoformat() if c.picked_up_at else None,
        "outcome": c.outcome or ("connected" if c.picked_up_at else "pending"),
        "room": c.room,
        "by_name": c.called_by_name,
        "identity_ok": c.identity_ok,
        "premises_shown": c.premises_shown,
        "headcount": c.headcount,
        "notes": c.notes or "",
        "random": bool(c.is_random),
    }


def _flag_if_missed(db: Session, c: VCCall) -> None:
    if c.outcome in ("no_answer", "wrong_person") or (c.outcome == "connected" and c.identity_ok is False):
        why = {
            "no_answer": f"Random verification call to {c.participant_name} went unanswered.",
            "wrong_person": f"Random verification call answered by someone other than {c.participant_name}.",
        }.get(c.outcome, f"Identity of {c.participant_name} could not be verified on the call.")
        db.add(Alert(institute_id=c.institute_id, type="vc_miss", severity="yellow", status="open", detail=why))


@router.post("/trigger", response_model=VCCallOut, status_code=201)
def trigger_call(payload: VCTriggerRequest, db: Session = Depends(get_db), user: User = Depends(require_role("admin", "official"))):
    person = db.get(User, payload.beneficiary_id)
    call = VCCall(institute_id=payload.institute_id, beneficiary_id=payload.beneficiary_id,
                  participant_name=person.name if person else None, participant_role="beneficiary",
                  called_by_id=user.id, called_by_name=user.name)
    db.add(call)
    db.commit()
    db.refresh(call)
    return call


@router.patch("/{call_id}/status", response_model=VCCallOut)
def update_status(call_id: str, payload: VCStatusRequest, db: Session = Depends(get_db), _user: User = Depends(require_role("admin", "official"))):
    call = db.get(VCCall, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    if payload.picked_up:
        call.picked_up_at = utcnow()
        call.outcome = "connected"
    db.commit()
    db.refresh(call)
    return call


@router.get("/calls")
def list_calls(request: Request, db: Session = Depends(get_db), user: User = Depends(require_role(*MONITOR_ROLES))):
    scope = institute_ids_in_scope(db, user, request)
    rows = db.query(VCCall).filter(VCCall.scheduled_at.is_(None)).order_by(VCCall.triggered_at.desc()).limit(300).all()
    return [call_view(db, c) for c in rows if in_scope(scope, c.institute_id) or str(c.called_by_id) == str(user.id)]


@router.post("/calls", status_code=201)
def log_call(payload: VCLogIn, db: Session = Depends(get_db), user: User = Depends(require_role(*MONITOR_ROLES))):
    inst = db.get(Institute, payload.institute_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Institute not found")
    c = VCCall(
        institute_id=inst.id,
        beneficiary_id=payload.participant_id if payload.participant_role == "beneficiary" and payload.participant_id else None,
        participant_name=payload.participant_name,
        participant_role=payload.participant_role,
        called_by_id=user.id,
        called_by_name=user.name,
        room=payload.room,
        outcome=payload.outcome,
        identity_ok=payload.identity_ok,
        premises_shown=payload.premises_shown,
        headcount=payload.headcount,
        notes=payload.notes,
        is_random=payload.random,
        triggered_at=payload.started_at.replace(tzinfo=None) if payload.started_at else utcnow(),
        picked_up_at=utcnow() if payload.outcome == "connected" else None,
    )
    db.add(c)
    _flag_if_missed(db, c)
    db.commit()
    db.refresh(c)
    audit.record(db, user, action="vc.logged", entity_type="vc_call", entity_id=c.id, entity_label=inst.name,
                 detail=f"{c.participant_role}: {c.outcome}")
    return call_view(db, c)


@router.patch("/calls/{call_id}")
def update_call(call_id: str, payload: VCOutcomeIn, db: Session = Depends(get_db), user: User = Depends(require_role(*MONITOR_ROLES))):
    c = db.get(VCCall, call_id)
    if not c:
        raise HTTPException(status_code=404, detail="Call not found")
    if user.role == "inspector" and str(c.called_by_id) != str(user.id):
        raise HTTPException(status_code=403, detail="Only the caller can record this call's outcome")
    was_pending = (c.outcome or "pending") == "pending"
    c.outcome = payload.outcome
    c.identity_ok = payload.identity_ok
    c.premises_shown = payload.premises_shown
    c.headcount = payload.headcount
    if payload.notes is not None:
        c.notes = payload.notes
    if payload.outcome == "connected" and not c.picked_up_at:
        c.picked_up_at = utcnow()
    if was_pending:
        _flag_if_missed(db, c)
    db.commit()
    db.refresh(c)
    audit.record(db, user, action="vc.outcome", entity_type="vc_call", entity_id=c.id, detail=c.outcome)
    return call_view(db, c)


@router.get("/calls/me")
def my_calls(db: Session = Depends(get_db), user: User = Depends(require_role("beneficiary"))):
    """Setu: the signed-in beneficiary's scheduled and past calls."""
    rows = db.query(VCCall).filter(VCCall.beneficiary_id == user.id).order_by(VCCall.triggered_at.desc()).all()
    out = []
    for c in rows:
        when = c.scheduled_at or c.triggered_at
        if c.scheduled_at and c.scheduled_at > utcnow() and (c.outcome or "pending") == "pending":
            status = "scheduled"
        elif c.outcome == "connected" or c.picked_up_at:
            status = "completed"
        elif c.outcome in ("no_answer", "wrong_person"):
            status = "missed"
        else:
            status = "scheduled" if c.scheduled_at else "completed"
        out.append({
            "id": c.id,
            "scheduled_at": when.isoformat() if when else None,
            "status": status,
            "official_name": c.official_name or c.called_by_name,
            "outcome": c.notes,
            "note": None if status != "scheduled" else (c.notes or "A routine well-being call. Staff will not be on the call."),
        })
    out.sort(key=lambda x: x["scheduled_at"] or "", reverse=True)
    return out


@router.post("/calls/requests", status_code=201)
def request_call(payload: CallRequestIn, db: Session = Depends(get_db), user: User = Depends(require_role("beneficiary"))):
    r = CallRequest(user_id=user.id, institute_id=user.institute_id, preferred_time=payload.preferred_time, note=payload.note)
    db.add(r)
    db.commit()
    db.refresh(r)
    audit.record(db, user, action="vc.requested", entity_type="call_request", entity_id=r.id, detail=payload.preferred_time or "")
    return {"id": r.id, "preferred_time": r.preferred_time, "note": r.note, "status": r.status, "created_at": r.created_at.isoformat()}


@router.get("/requests")
def list_call_requests(request: Request, db: Session = Depends(get_db), user: User = Depends(require_role("official", "admin", "district_authority", "state_authority"))):
    scope = institute_ids_in_scope(db, user, request)
    rows = db.query(CallRequest).order_by(CallRequest.created_at.desc()).limit(200).all()
    out = []
    for r in rows:
        if r.institute_id and not in_scope(scope, r.institute_id):
            continue
        u = db.get(User, r.user_id)
        out.append({"id": r.id, "name": u.name if u else None, "institute_id": r.institute_id,
                    "preferred_time": r.preferred_time, "note": r.note, "status": r.status,
                    "created_at": r.created_at.isoformat()})
    return out


@router.get("/directory")
def directory(
    institute_id: str = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """People who can be called at an institute: the in-charge and staff
    (institute_staff users) and residents (beneficiaries, named by initials
    and room only). Phone numbers are masked."""
    if user.role not in MONITOR_ROLES:
        raise HTTPException(status_code=403, detail="Not permitted")
    inst = db.get(Institute, institute_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Institute not found")
    people = db.query(User).filter(User.institute_id == institute_id).all()

    def mask(u: User) -> str:
        digits = "".join(ch for ch in (u.phone_number or "") if ch.isdigit())
        return f"+91 ••••• ••{digits[-3:]}" if len(digits) >= 3 else "+91 ••••• •••"

    out = []
    staff = [p for p in people if p.role == "institute_staff"]
    for k, p in enumerate(staff):
        out.append({"id": p.id, "institute_id": inst.id, "name": p.name,
                    "role": "incharge" if k == 0 else "staff", "phone_masked": mask(p)})
    for p in people:
        if p.role != "beneficiary":
            continue
        prof = db.get(BeneficiaryProfile, p.id)
        initials = ". ".join(w[0] for w in p.name.split()[:2]) + "."
        label = f"{initials} · {prof.room}" if prof and prof.room else initials
        out.append({"id": p.id, "institute_id": inst.id, "name": label, "role": "beneficiary", "phone_masked": mask(p)})
    return out
