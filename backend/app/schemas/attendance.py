from pydantic import BaseModel


class AttendanceCheckInRequest(BaseModel):
    institute_id: str
    user_id: str
    # base64-encoded live photo; passed to the pluggable face-match service
    photo_base64: str


class AttendanceCheckInResult(BaseModel):
    verified: bool
    confidence_score: float
    method: str
