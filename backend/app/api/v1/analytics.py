from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.core.scope import MONITOR_ROLES, in_scope, institute_ids_in_scope
from app.core.time import utcnow
from app.db.base import get_db
from app.db.models.alert import Alert
from app.db.models.extras import AttendanceDaily
from app.db.models.institute import Institute
from app.db.models.user import User
from app.schemas.camera_and_analytics import ComplianceSummary

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


@router.get("/compliance-summary", response_model=ComplianceSummary)
def compliance_summary(request: Request, db: Session = Depends(get_db), user: User = Depends(require_role("official", "admin", "district_authority", "state_authority"))):
    """
    The aggregate view a single institute's score can't show: how many
    institutes are in each status bucket, the average score across the
    whole portfolio, and how many alerts are currently open.
    """
    scope = institute_ids_in_scope(db, user, request)
    institutes = [i for i in db.query(Institute).all() if in_scope(scope, i.id)]
    total = len(institutes)
    avg_score = (sum(float(i.compliance_score) for i in institutes) / total) if total else 0.0
    alerts = [a for a in db.query(Alert).filter(Alert.status == "open").all() if in_scope(scope, a.institute_id)]

    return ComplianceSummary(
        total_institutes=total,
        average_compliance_score=round(avg_score, 2),
        green_count=sum(1 for i in institutes if i.status == "green"),
        yellow_count=sum(1 for i in institutes if i.status == "yellow"),
        red_count=sum(1 for i in institutes if i.status == "red"),
        open_alerts_count=len(alerts),
        red_alerts_count=sum(1 for a in alerts if a.severity == "red"),
    )


@router.get("/attendance")
def attendance(
    request: Request,
    institute_id: str = Query(...),
    days: int = Query(default=30, ge=7, le=180),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*MONITOR_ROLES)),
):
    """Daily attendance roll-up for one institute (Nayan's AI insights chart):
    [{date, present, enrolled, staff_present, staff_total, camera_uptime}]"""
    if user.role != "inspector" and not in_scope(institute_ids_in_scope(db, user, request), institute_id):
        raise HTTPException(status_code=403, detail="Institute is outside your area")
    since = (utcnow() - timedelta(days=days)).date()
    rows = (
        db.query(AttendanceDaily)
        .filter(AttendanceDaily.institute_id == institute_id, AttendanceDaily.date >= since)
        .order_by(AttendanceDaily.date.asc())
        .all()
    )
    return [
        {
            "date": r.date.isoformat(),
            "present": r.present,
            "enrolled": r.enrolled,
            "staff_present": r.staff_present,
            "staff_total": r.staff_total,
            "camera_uptime": r.camera_uptime,
        }
        for r in rows
    ]


@router.get("/open-alerts-by-institute")
def open_alerts_by_institute(request: Request, db: Session = Depends(get_db), user: User = Depends(require_role("official", "admin", "district_authority", "state_authority"))):
    scope = institute_ids_in_scope(db, user, request)
    rows = db.query(Alert.institute_id, func.count(Alert.id)).filter(Alert.status == "open").group_by(Alert.institute_id).all()
    return [{"institute_id": str(i), "open_alerts": n} for i, n in rows if in_scope(scope, i)]
