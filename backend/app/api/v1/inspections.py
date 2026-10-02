"""Nayan files the inspection record here after its evidence has uploaded."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_role
from app.core.scope import in_scope, institute_ids_in_scope
from app.core.time import utcnow
from app.db.base import get_db
from app.db.models.assignment import Assignment
from app.db.models.evidence import Evidence
from app.db.models.extras import Inspection
from app.db.models.institute import Institute
from app.db.models.user import User
from app.services import audit
from app.services.geofence import haversine_distance_meters

router = APIRouter(prefix="/api/v1/inspections", tags=["inspections"])


class InspectionIn(BaseModel):
    assignment_id: str
    institute_id: str | None = None
    remarks: str = Field(default="", max_length=5000)
    checklist: dict[str, str] = {}
    evidence_ids: list[str | None] = []
    client_hashes: list[str] = []
    gps_lat: float | None = None
    gps_lng: float | None = None
    started_at: datetime | None = None
    submitted_at: datetime | None = None
    device_id: str | None = Field(default=None, max_length=255)


def view(db: Session, i: Inspection) -> dict:
    inst = db.get(Institute, i.institute_id)
    insp = db.get(User, i.inspector_id)
    return {
        "id": i.id,
        "assignment_id": i.assignment_id,
        "institute_id": i.institute_id,
        "institute_name": inst.name if inst else None,
        "inspector_id": i.inspector_id,
        "inspector_name": insp.name if insp else None,
        "remarks": i.remarks,
        "checklist": i.checklist or {},
        "evidence_ids": i.evidence_ids or [],
        "gps_lat": i.gps_lat,
        "gps_lng": i.gps_lng,
        "distance_m": i.distance_m,
        "started_at": i.started_at.isoformat() if i.started_at else None,
        "submitted_at": i.submitted_at.isoformat() if i.submitted_at else None,
    }


@router.post("", status_code=201)
def submit_inspection(payload: InspectionIn, db: Session = Depends(get_db), user: User = Depends(require_role("inspector"))):
    a = db.get(Assignment, payload.assignment_id)
    if not a or str(a.inspector_id) != str(user.id):
        raise HTTPException(status_code=404, detail="Assignment not found")
    inst = db.get(Institute, a.institute_id)
    ids = [e for e in payload.evidence_ids if e]
    files = db.query(Evidence).filter(Evidence.assignment_id == a.id).all()
    known = {e.id for e in files}
    unknown = [e for e in ids if e not in known]
    if unknown:
        raise HTTPException(status_code=422, detail=f"Evidence not found for this assignment: {unknown[:3]}")
    distance = None
    if payload.gps_lat is not None and payload.gps_lng is not None and inst is not None:
        distance = haversine_distance_meters(payload.gps_lat, payload.gps_lng, inst.latitude, inst.longitude)
    rec = Inspection(
        assignment_id=a.id,
        inspector_id=user.id,
        institute_id=a.institute_id,
        remarks=payload.remarks,
        checklist=payload.checklist,
        evidence_ids=ids,
        client_hashes=payload.client_hashes,
        gps_lat=payload.gps_lat,
        gps_lng=payload.gps_lng,
        distance_m=distance,
        device_id=payload.device_id,
        started_at=payload.started_at.replace(tzinfo=None) if payload.started_at else None,
        submitted_at=utcnow(),
    )
    db.add(rec)
    # Every file was hash-verified on upload, so a filed inspection whose
    # files all belong to it counts as verified.
    a.status = "verified" if ids and len(ids) == len(payload.client_hashes) else "submitted"
    if inst is not None:
        inst.last_inspection_at = utcnow()
    db.commit()
    db.refresh(rec)
    answers = payload.checklist.values()
    audit.record(db, user, action="inspection.submitted", entity_type="assignment", entity_id=a.id,
                 entity_label=inst.name if inst else None,
                 detail=f"{len(ids)} files · {sum(1 for x in answers if x == 'no')} checklist 'no'")
    return view(db, rec)


@router.get("")
def list_inspections(request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(Inspection)
    if user.role == "inspector":
        q = q.filter(Inspection.inspector_id == user.id)
    elif user.role not in ("official", "admin", "district_authority", "state_authority"):
        raise HTTPException(status_code=403, detail="Not permitted")
    rows = q.order_by(Inspection.submitted_at.desc()).limit(300).all()
    if user.role != "inspector":
        scope = institute_ids_in_scope(db, user, request)
        rows = [r for r in rows if in_scope(scope, r.institute_id)]
    return [view(db, r) for r in rows]
