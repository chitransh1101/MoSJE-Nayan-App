from datetime import datetime

from pydantic import BaseModel, Field

from app.db.models.grievance import GRIEVANCE_STATUSES


class GrievanceCreate(BaseModel):
    institute_id: str
    subject: str = Field(min_length=3, max_length=255)
    description: str = Field(min_length=5)
    # Setu's optional extras
    category: str | None = Field(default=None, max_length=30)
    urgency: str | None = Field(default=None, max_length=10)
    confidential: bool | None = None


class GrievanceOut(BaseModel):
    id: str
    institute_id: str
    submitted_by_id: str
    subject: str
    description: str
    status: str
    created_at: datetime
    category: str | None = None
    urgency: str | None = "normal"
    confidential: bool | None = False
    escalation_level: int | None = 1
    escalated_at: datetime | None = None
    sla_due_at: datetime | None = None
    updates: list[dict] | None = None

    model_config = {"from_attributes": True}


class GrievanceStatusUpdate(BaseModel):
    status: str = Field(description=f"One of {GRIEVANCE_STATUSES}")


class GrievanceEscalate(BaseModel):
    reason: str | None = Field(default=None, max_length=500)
