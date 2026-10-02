from datetime import timedelta

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user, require_role
from app.core.scope import in_scope, institute_ids_in_scope
from app.core.time import utcnow
from app.db.base import get_db
from app.db.models.assignment import Assignment
from app.db.models.institute import Institute
from app.db.models.user import User
from app.schemas.assignment import (AssignmentDetailOut, AssignmentOut,
                                    GenerateRequest, GeofencePingRequest)
from app.schemas.institute import InstituteOut
from app.services import audit
from app.services.assignment_engine import Inspector
from app.services.assignment_engine import Institute as EngineInstitute
from app.services.assignment_engine import recently_paired, select_assignment
from app.services.geofence import is_within_geofence

router = APIRouter(prefix="/api/v1/assignments", tags=["assignments"])


def _build_history(db: Session) -> dict[str, list[str]]:
    """inspector_id -> chronological list of institute_ids inspected, for the fairness constraint."""
    rows = db.query(Assignment).order_by(Assignment.created_at.asc()).all()
    history: dict[str, list[str]] = {}
    for row in rows:
        history.setdefault(str(row.inspector_id), []).append(str(row.institute_id))
    return history


def _days_since_last_inspection(db: Session, institute_id) -> int:
    last = (
        db.query(func.max(Assignment.created_at))
        .filter(Assignment.institute_id == institute_id)
        .scalar()
    )
    if last is None:
        return 30  # never inspected -> treat as heavily overdue
    return max(1, (utcnow() - last).days)


def detail(db: Session, a: Assignment) -> AssignmentDetailOut:
    inst = db.get(Institute, a.institute_id)
    insp = db.get(User, a.inspector_id)
    base = AssignmentOut.model_validate(a).model_dump()
    return AssignmentDetailOut(
        **base,
        due_at=a.dispatch_time,
        inspector_name=insp.name if insp else None,
        institute=InstituteOut.model_validate(inst) if inst else None,
    )


@router.get("", response_model=list[AssignmentDetailOut])
def list_assignments(request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Officials see every draw in their area; an inspector sees only their own visits."""
    q = db.query(Assignment)
    if user.role == "inspector":
        q = q.filter(Assignment.inspector_id == user.id)
    elif user.role not in ("official", "admin", "district_authority", "state_authority"):
        raise HTTPException(status_code=403, detail="Not permitted to view assignments")
    rows = q.order_by(Assignment.created_at.desc()).limit(300).all()
    if user.role != "inspector":
        scope = institute_ids_in_scope(db, user, request)
        rows = [r for r in rows if in_scope(scope, r.institute_id)]
    return [detail(db, r) for r in rows]


@router.post("/generate", response_model=AssignmentDetailOut, status_code=201)
def generate_assignment(
    payload: GenerateRequest | None = Body(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "official", "district_authority", "state_authority")),
):
    """
    With no body: the server's CSPRNG draw (Sentinel). With a body naming an
    institute and inspector (Nayan's verifiable, seed-sealed draw): the
    server re-checks the rules - inspector role, fairness window - and
    records the draw's commitment hash alongside its own audit reference.
    """
    history = _build_history(db)
    if payload and payload.institute_id and payload.inspector_id:
        inst = db.get(Institute, payload.institute_id)
        insp = db.get(User, payload.inspector_id)
        if not inst:
            raise HTTPException(status_code=404, detail="Institute not found")
        if not insp or insp.role != "inspector":
            raise HTTPException(status_code=422, detail="inspector_id must be an inspector")
        if recently_paired(str(insp.id), str(inst.id), history, settings.FAIRNESS_WINDOW):
            raise HTTPException(status_code=409, detail="This inspector inspected this institute recently - fairness rule")
        import secrets

        assignment = Assignment(
            institute_id=inst.id,
            inspector_id=insp.id,
            random_seed_ref=secrets.token_hex(16),
            dispatch_time=payload.dispatch_time or (utcnow() + timedelta(hours=4)),
            strategy=payload.strategy or "client",
            seed_commitment=payload.seed_commitment,
            instructions=payload.instructions,
            priority=payload.priority or "urgent",
        )
    else:
        institutes = db.query(Institute).all()
        inspectors = db.query(User).filter(User.role == "inspector").all()
        if not institutes:
            raise HTTPException(status_code=400, detail="No institutes registered")
        if not inspectors:
            raise HTTPException(status_code=400, detail="No inspectors registered")

        engine_institutes = [
            EngineInstitute(id=str(i.id), days_since_last_inspection=_days_since_last_inspection(db, i.id))
            for i in institutes
        ]
        engine_inspectors = [Inspector(id=str(i.id)) for i in inspectors]
        result = select_assignment(engine_institutes, engine_inspectors, history, fairness_window=settings.FAIRNESS_WINDOW)
        assignment = Assignment(
            institute_id=result.institute_id,
            inspector_id=result.inspector_id,
            random_seed_ref=result.random_seed_ref,
            dispatch_time=result.dispatch_time,
            strategy="engine",
            priority="normal",
        )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    inst = db.get(Institute, assignment.institute_id)
    audit.record(
        db, user, action="assignment.drawn", entity_type="assignment", entity_id=assignment.id,
        entity_label=inst.name if inst else None,
        detail=f"{assignment.strategy} draw · ref {assignment.random_seed_ref[:8]}…" + (f" · seal {assignment.seed_commitment[:12]}…" if assignment.seed_commitment else ""),
    )
    return detail(db, assignment)


@router.get("/mine", response_model=AssignmentOut | None)
def my_assignment(db: Session = Depends(get_db), user: User = Depends(require_role("inspector"))):
    """An inspector's own latest assignment (kept for the original mobile client)."""
    return (
        db.query(Assignment)
        .filter(Assignment.inspector_id == user.id)
        .order_by(Assignment.created_at.desc())
        .first()
    )


@router.post("/{assignment_id}/geofence-ping", response_model=AssignmentOut)
def geofence_ping(
    assignment_id: str,
    payload: GeofencePingRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("inspector")),
):
    assignment = db.get(Assignment, assignment_id)
    if not assignment or str(assignment.inspector_id) != str(user.id):
        raise HTTPException(status_code=404, detail="Assignment not found")

    institute = db.get(Institute, assignment.institute_id)
    if is_within_geofence(payload.latitude, payload.longitude, institute.latitude, institute.longitude, settings.GEOFENCE_RADIUS_METERS):
        now = utcnow()
        assignment.geofence_triggered_at = now
        # This is the only moment the institute learns it's being inspected -
        # the notice window is near-zero by design.
        assignment.notified_institute_at = now
        if assignment.status == "assigned":
            assignment.status = "in_progress"
        db.commit()
        db.refresh(assignment)

    return assignment
