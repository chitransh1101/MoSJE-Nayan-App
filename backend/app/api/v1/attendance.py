from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.base import get_db
from app.db.models.attendance import AttendanceEvent
from app.db.models.user import User
from app.schemas.attendance import (AttendanceCheckInRequest,
                                    AttendanceCheckInResult)
from app.services.face_match import get_face_matcher

router = APIRouter(prefix="/api/v1/attendance", tags=["attendance"])

# A fixed reference image stands in for "the stored onboarding photo" in
# this demo build - production pulls this from the user's stored
# reference embedding rather than a request field.
_DEMO_REFERENCE_IMAGE = "demo-reference-photo"


@router.post("/check-in", response_model=AttendanceCheckInResult)
def check_in(
    payload: AttendanceCheckInRequest,
    db: Session = Depends(get_db),
    _user: User = Depends(require_role("institute_staff", "inspector")),
):
    matcher = get_face_matcher()
    verified, confidence = matcher.verify(_DEMO_REFERENCE_IMAGE, payload.photo_base64)

    event = AttendanceEvent(
        institute_id=payload.institute_id,
        user_id=payload.user_id,
        method="face_match",
        confidence_score=confidence,
        cctv_cross_check=False,
    )
    db.add(event)
    db.commit()

    return AttendanceCheckInResult(verified=verified, confidence_score=confidence, method="face_match")
