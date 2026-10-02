from datetime import datetime

from pydantic import BaseModel


class EvidenceOut(BaseModel):
    id: str
    assignment_id: str
    file_url: str
    sha256_hash: str
    gps_lat: float
    gps_lng: float
    device_id: str
    captured_at: datetime
    kind: str | None = "photo"
    distance_m: float | None = None

    model_config = {"from_attributes": True}


class EvidenceUploadResult(BaseModel):
    status: str  # "OK" | "REJECTED"
    reason: str | None = None
    evidence: EvidenceOut | None = None
