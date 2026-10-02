from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_role
from app.core.scope import in_scope, institute_ids_in_scope
from app.db.base import get_db
from app.db.models.alert import Alert
from app.db.models.extras import AlertResponse
from app.db.models.institute import Institute
from app.db.models.user import User
from app.schemas.camera_and_analytics import RenewalDecision
from app.schemas.institute import (INSTITUTE_TYPES, InstituteCreate,
                                   InstituteDetailOut, InstituteOut)
from app.services import audit
from app.services.benefits import resident_summary

router = APIRouter(prefix="/api/v1/institutes", tags=["institutes"])
public_router = APIRouter(prefix="/api/v1/public", tags=["public"])


def detail_view(inst: Institute) -> InstituteDetailOut:
    base = InstituteOut.model_validate(inst).model_dump()
    return InstituteDetailOut(
        **base,
        address=inst.address,
        capacity=inst.capacity,
        residents=inst.residents_count,
        registration_no=inst.registration_no,
        registration_valid_until=inst.registration_valid_until,
        superintendent=inst.superintendent,
        last_inspection_at=inst.last_inspection_at,
        score_history=inst.score_history,
    )


@router.get("", response_model=list[InstituteOut])
def list_institutes(request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(Institute)
    scope = institute_ids_in_scope(db, user, request) if user.role in ("state_authority", "district_authority") or request.headers.get("X-Sentinel-Region") else None
    items = q.order_by(Institute.name).all()
    return [i for i in items if in_scope(scope, i.id)]


@router.post("", response_model=InstituteOut, status_code=201)
def create_institute(
    payload: InstituteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "official")),
):
    if payload.type not in INSTITUTE_TYPES:
        raise HTTPException(status_code=422, detail=f"type must be one of {INSTITUTE_TYPES}")

    institute = Institute(**payload.model_dump())
    db.add(institute)
    db.commit()
    db.refresh(institute)
    audit.record(db, user, action="institute.created", entity_type="institute", entity_id=institute.id, entity_label=institute.name, detail=f"{institute.type} in {institute.district or ''}")
    return institute


@router.get("/{institute_id}", response_model=InstituteDetailOut)
def get_institute(institute_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role in ("institute_staff", "beneficiary") and str(user.institute_id) != str(institute_id):
        raise HTTPException(status_code=403, detail="You can only view your own institute")
    inst = db.get(Institute, institute_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Institute not found")
    return detail_view(inst)


@router.get("/{institute_id}/score")
def get_score(institute_id: str, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    institute = db.get(Institute, institute_id)
    if not institute:
        raise HTTPException(status_code=404, detail="Institute not found")
    return {"institute_id": institute_id, "compliance_score": float(institute.compliance_score), "status": institute.status}


@router.patch("/{institute_id}/renewal", response_model=InstituteOut)
def decide_renewal(
    institute_id: str,
    payload: RenewalDecision,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("official", "admin")),
):
    if payload.decision not in ("approved", "rejected"):
        raise HTTPException(status_code=422, detail="decision must be 'approved' or 'rejected'")

    institute = db.get(Institute, institute_id)
    if not institute:
        raise HTTPException(status_code=404, detail="Institute not found")

    before = institute.renewal_status
    institute.renewal_status = payload.decision
    db.commit()
    db.refresh(institute)
    audit.record(
        db, user, action=f"renewal.{payload.decision}", entity_type="institute", entity_id=institute.id,
        entity_label=institute.name, detail=f"{before} → {payload.decision}",
        before={"renewal_status": before}, after={"renewal_status": payload.decision},
    )
    return institute


@router.get("/{institute_id}/alerts")
def institute_scoped_alerts(
    institute_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Setu's 'findings for my institute' screen (each finding carries the
    institute's written responses). Staff and beneficiaries only ever see
    their own institute's; officials see any.
    """
    if user.role in ("institute_staff", "beneficiary") and str(user.institute_id) != str(institute_id):
        raise HTTPException(status_code=403, detail="You can only view your own institute's findings")
    if user.role not in ("official", "admin", "institute_staff", "beneficiary", "inspector", "district_authority", "state_authority"):
        raise HTTPException(status_code=403, detail="Not permitted to view findings")

    alerts = db.query(Alert).filter(Alert.institute_id == institute_id).order_by(Alert.created_at.desc()).all()
    ids = [a.id for a in alerts]
    responses: dict[str, list[dict]] = {}
    if ids:
        for r in db.query(AlertResponse).filter(AlertResponse.alert_id.in_(ids)).order_by(AlertResponse.created_at.asc()).all():
            responses.setdefault(str(r.alert_id), []).append(
                {"id": r.id, "message": r.message, "author_name": r.author_name, "created_at": r.created_at.isoformat()}
            )
    return [
        {
            "id": a.id,
            "institute_id": a.institute_id,
            "type": a.type,
            "severity": a.severity,
            "status": a.status,
            "detail": a.detail,
            "created_at": a.created_at.isoformat(),
            "responses": responses.get(str(a.id), []),
        }
        for a in alerts
    ]


@router.get("/{institute_id}/residents")
def residents(institute_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """The institute's residents, one summary each (Setu staff view)."""
    if user.role == "institute_staff":
        if str(user.institute_id) != str(institute_id):
            raise HTTPException(status_code=403, detail="You can only view your own institute's residents")
    elif user.role not in ("official", "admin", "district_authority", "state_authority"):
        raise HTTPException(status_code=403, detail="Not permitted to view residents")
    people = (
        db.query(User)
        .filter(User.institute_id == institute_id, User.role == "beneficiary")
        .order_by(User.name)
        .all()
    )
    return [resident_summary(db, p) for p in people]


@public_router.get("/institutes")
def public_directory(
    state: str | None = Query(default=None),
    q: str | None = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
):
    """No sign-in needed: the public register Setu's start flow searches."""
    query = db.query(Institute)
    if state:
        query = query.filter(Institute.state == state)
    if q:
        query = query.filter(Institute.name.ilike(f"%{q}%"))
    return [
        {"id": i.id, "name": i.name, "district": i.district, "state": i.state, "type": i.type}
        for i in query.order_by(Institute.state, Institute.name).limit(500).all()
    ]
