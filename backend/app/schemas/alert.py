from datetime import datetime

from pydantic import BaseModel, Field

ALERT_ACTIONS = ("reviewed", "escalated", "closed")


class AlertOut(BaseModel):
    id: str
    institute_id: str
    type: str
    severity: str
    status: str
    detail: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AlertActionRequest(BaseModel):
    action: str = Field(description=f"One of {ALERT_ACTIONS}")
