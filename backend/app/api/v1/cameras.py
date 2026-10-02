from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.core.scope import MONITOR_ROLES, in_scope, institute_ids_in_scope
from app.db.base import get_db
from app.db.models.camera_feed import CameraFeed
from app.db.models.user import User
from app.schemas.camera_and_analytics import CameraFeedOut

router = APIRouter(prefix="/api/v1", tags=["cameras"])


@router.get("/cameras", response_model=list[CameraFeedOut])
def list_all_cameras(request: Request, db: Session = Depends(get_db), user: User = Depends(require_role(*MONITOR_ROLES))):
    """The cross-institute camera wall (Sentinel, and Nayan's Live CCTV).
    Officials see their area; an inspector sees the cameras of the
    institutes they are assigned to. Institute staff are refused (403)."""
    scope = institute_ids_in_scope(db, user, request)
    return [c for c in db.query(CameraFeed).all() if in_scope(scope, c.institute_id)]


@router.get("/institutes/{institute_id}/cameras", response_model=list[CameraFeedOut])
def list_institute_cameras(
    institute_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("official", "admin", "institute_staff", "inspector", "district_authority", "state_authority")),
):
    if user.role == "institute_staff" and str(user.institute_id) != str(institute_id):
        raise HTTPException(status_code=403, detail="You can only view your own institute's cameras")
    return db.query(CameraFeed).filter(CameraFeed.institute_id == institute_id).all()
