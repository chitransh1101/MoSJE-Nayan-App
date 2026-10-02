from datetime import datetime

from pydantic import BaseModel


class CameraFeedOut(BaseModel):
    id: str
    institute_id: str
    name: str
    status: str
    last_ping_at: datetime | None
    snapshot_url: str | None = None
    stream_url: str | None = None

    model_config = {"from_attributes": True}


class ComplianceSummary(BaseModel):
    """Cross-institute analytics for Sentinel's dashboard - the aggregate
    view a single institute's score can't show on its own."""
    total_institutes: int
    average_compliance_score: float
    green_count: int
    yellow_count: int
    red_count: int
    open_alerts_count: int
    red_alerts_count: int


class RenewalDecision(BaseModel):
    decision: str  # "approved" | "rejected"
