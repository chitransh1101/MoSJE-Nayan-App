from datetime import datetime

from fastapi import APIRouter, Depends, Form, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import require_role
from app.core.scope import in_scope, institute_ids_in_scope
from app.db.base import get_db
from app.db.models.alert import Alert
from app.db.models.assignment import Assignment
from app.db.models.evidence import Evidence
from app.db.models.institute import Institute
from app.db.models.user import User
from app.schemas.evidence import EvidenceOut, EvidenceUploadResult
from app.services import audit
from app.services.geofence import haversine_distance_meters
from app.services.hashing import verify_hash
from app.services.storage import EVIDENCE_TYPES, extension_ok, get_storage, safe_filename

router = APIRouter(prefix="/api/v1/evidence", tags=["evidence"])


@router.post("/upload", response_model=EvidenceUploadResult)
async def upload_evidence(
    file: UploadFile,
    assignment_id: str = Form(...),
    client_hash: str = Form(..., description="SHA-256 computed on-device at capture time"),
    gps_lat: float = Form(...),
    gps_lng: float = Form(...),
    device_id: str = Form(...),
    captured_at: str | None = Form(default=None, description="ISO time of capture on the device"),
    kind: str | None = Form(default=None, description="photo | video"),
    db: Session = Depends(get_db),
    user: User = Depends(require_role("inspector")),
):
    assignment = db.get(Assignment, assignment_id)
    if not assignment or str(assignment.inspector_id) != str(user.id):
        raise HTTPException(status_code=404, detail="Assignment not found")
    institute = db.get(Institute, assignment.institute_id)

    if not extension_ok(file.filename, EVIDENCE_TYPES):
        raise HTTPException(status_code=415, detail="This file type isn't accepted. Upload a photo (JPG, PNG, HEIC) or video (MP4, MOV).")
    contents = await file.read()
    if len(contents) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File too large. The limit is {settings.MAX_UPLOAD_MB} MB.")
    if not contents:
        raise HTTPException(status_code=400, detail="The file is empty.")

    # The single most important check in the whole pipeline: the client's
    # claimed hash must match what the server independently computes from
    # the bytes it actually received. Any mismatch is an instant, outright
    # rejection - never a warning, never a "flagged but accepted" - and it
    # raises an alert officials see in Sentinel.
    matches, server_hash = verify_hash(contents, client_hash)
    if not matches:
        db.add(Alert(
            institute_id=assignment.institute_id, type="hash_mismatch", severity="red", status="open",
            detail=f"Evidence upload rejected: client hash {client_hash[:4]}…{client_hash[-4:]}, server-computed {server_hash[:4]}…{server_hash[-4:]}.",
        ))
        db.commit()
        audit.record(db, user, action="evidence.rejected", entity_type="assignment", entity_id=assignment.id,
                     entity_label=institute.name if institute else None, detail="hash_mismatch")
        return EvidenceUploadResult(status="REJECTED", reason="hash_mismatch")

    distance = None
    if institute is not None:
        distance = haversine_distance_meters(gps_lat, gps_lng, institute.latitude, institute.longitude)
        if distance > settings.GEOFENCE_RADIUS_METERS:
            # Accepted (the file is genuine) but flagged: captured away from the site.
            db.add(Alert(
                institute_id=institute.id, type="geofence_breach", severity="yellow", status="open",
                detail=f"Evidence captured {distance / 1000:.1f} km from the registered location, outside the {int(settings.GEOFENCE_RADIUS_METERS)} m geofence.",
            ))

    storage = get_storage()
    key = f"{assignment.id}/{server_hash}_{safe_filename(file.filename, 'evidence')}"
    file_url = storage.save(key, contents)

    when = None
    if captured_at:
        try:
            when = datetime.fromisoformat(captured_at.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            when = None

    evidence = Evidence(
        assignment_id=assignment_id,
        file_url=file_url,
        sha256_hash=server_hash,
        gps_lat=gps_lat,
        gps_lng=gps_lng,
        device_id=device_id,
        kind=(kind or "photo")[:10],
        distance_m=distance,
        **({"captured_at": when} if when else {}),
    )
    db.add(evidence)
    if assignment.status == "assigned":
        assignment.status = "in_progress"
    db.commit()
    db.refresh(evidence)
    audit.record(db, user, action="evidence.verified", entity_type="assignment", entity_id=assignment.id,
                 entity_label=institute.name if institute else None, detail=f"{evidence.kind} {server_hash[:12]}…")

    return EvidenceUploadResult(status="OK", evidence=EvidenceOut.model_validate(evidence))


@router.get("", response_model=list[EvidenceOut])
def evidence_ledger(request: Request, db: Session = Depends(get_db), user: User = Depends(require_role("official", "admin", "district_authority", "state_authority"))):
    """Every verified file in the official's area, newest first."""
    scope = institute_ids_in_scope(db, user, request)
    rows = db.query(Evidence).order_by(Evidence.captured_at.desc()).limit(500).all()
    if scope is None:
        return rows
    allowed = {a.id for a in db.query(Assignment).all() if in_scope(scope, a.institute_id)}
    return [r for r in rows if r.assignment_id in allowed]


@router.get("/{assignment_id}", response_model=list[EvidenceOut])
def list_evidence_for_assignment(assignment_id: str, db: Session = Depends(get_db), user: User = Depends(require_role("official", "admin", "inspector", "district_authority", "state_authority"))):
    if user.role == "inspector":
        a = db.get(Assignment, assignment_id)
        if not a or str(a.inspector_id) != str(user.id):
            raise HTTPException(status_code=404, detail="Assignment not found")
    return db.query(Evidence).filter(Evidence.assignment_id == assignment_id).all()
