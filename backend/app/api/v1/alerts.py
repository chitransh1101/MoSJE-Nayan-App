from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_role
from app.core.scope import MONITOR_ROLES, in_scope, institute_ids_in_scope
from app.db.base import get_db
from app.db.models.alert import Alert
from app.db.models.extras import AlertResponse
from app.db.models.institute import Institute
from app.db.models.user import User
from app.schemas.alert import ALERT_ACTIONS, AlertActionRequest, AlertOut
from app.services import audit

router = APIRouter(prefix="/api/v1/alerts", tags=["alerts"])


class AlertResponseIn(BaseModel):
    message: str = Field(min_length=3, max_length=4000)


class AlertCreate(BaseModel):
    """Raised by hand from Nayan (CCTV viewer / VC outcome)."""
    institute_id: str
    type: str = Field(max_length=30)
    severity: str = Field(default="yellow", pattern="^(yellow|red)$")
    detail: str | None = Field(default=None, max_length=500)


@router.get("", response_model=list[AlertOut])
def list_alerts(
    request: Request,
    severity: str | None = Query(default=None),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*MONITOR_ROLES)),
):
    q = db.query(Alert)
    if severity:
        q = q.filter(Alert.severity == severity)
    if status:
        q = q.filter(Alert.status == status)
    scope = institute_ids_in_scope(db, user, request)
    return [a for a in q.order_by(Alert.created_at.desc()).all() if in_scope(scope, a.institute_id)]


@router.post("", response_model=AlertOut, status_code=201)
def raise_alert(payload: AlertCreate, request: Request, db: Session = Depends(get_db), user: User = Depends(require_role(*MONITOR_ROLES))):
    inst = db.get(Institute, payload.institute_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Institute not found")
    if not in_scope(institute_ids_in_scope(db, user, request), inst.id) and user.role != "inspector":
        raise HTTPException(status_code=403, detail="Institute is outside your area")
    alert = Alert(institute_id=inst.id, type=payload.type, severity=payload.severity, status="open",
                  detail=payload.detail or f"Raised by {user.name}")
    db.add(alert)
    db.commit()
    db.refresh(alert)
    audit.record(db, user, action="alert.raised", entity_type="alert", entity_id=alert.id, entity_label=inst.name, detail=f"{alert.type}: {alert.detail}")
    return alert


@router.patch("/{alert_id}/action", response_model=AlertOut)
def act_on_alert(
    alert_id: str,
    payload: AlertActionRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("official", "admin", "district_authority", "state_authority")),
):
    if payload.action not in ALERT_ACTIONS:
        raise HTTPException(status_code=422, detail=f"action must be one of {ALERT_ACTIONS}")

    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if not in_scope(institute_ids_in_scope(db, user, request), alert.institute_id):
        raise HTTPException(status_code=403, detail="Alert is outside your area")

    before = alert.status
    alert.status = payload.action
    db.commit()
    db.refresh(alert)
    inst = db.get(Institute, alert.institute_id)
    audit.record(
        db, user, action=f"alert.{payload.action}", entity_type="alert", entity_id=alert.id,
        entity_label=inst.name if inst else None, detail=f"{alert.type}: {before} → {payload.action}",
        before={"status": before}, after={"status": payload.action},
    )
    return alert


@router.post("/{alert_id}/responses", status_code=201)
def respond_to_alert(alert_id: str, payload: AlertResponseIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Setu: an institute writes its reply to a finding. Officials see it in Sentinel."""
    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if user.role == "institute_staff":
        if str(user.institute_id) != str(alert.institute_id):
            raise HTTPException(status_code=403, detail="You can only respond to your own institute's findings")
    elif user.role not in ("official", "admin"):
        raise HTTPException(status_code=403, detail="Not permitted to respond to findings")
    resp = AlertResponse(alert_id=alert.id, user_id=user.id, author_name=user.name, message=payload.message)
    db.add(resp)
    db.commit()
    db.refresh(resp)
    audit.record(db, user, action="alert.response", entity_type="alert", entity_id=alert.id, detail=payload.message[:200])
    return {"id": resp.id, "alert_id": resp.alert_id, "message": resp.message, "author_name": resp.author_name,
            "created_at": resp.created_at.isoformat()}


@router.get("/{alert_id}/responses")
def list_responses(alert_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if user.role in ("institute_staff", "beneficiary") and str(user.institute_id) != str(alert.institute_id):
        raise HTTPException(status_code=403, detail="Not your institute")
    rows = db.query(AlertResponse).filter(AlertResponse.alert_id == alert.id).order_by(AlertResponse.created_at.asc()).all()
    return [{"id": r.id, "message": r.message, "author_name": r.author_name, "created_at": r.created_at.isoformat()} for r in rows]
