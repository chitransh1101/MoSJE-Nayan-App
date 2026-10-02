from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.institute import InstituteOut


class AssignmentOut(BaseModel):
    id: str
    institute_id: str
    inspector_id: str
    random_seed_ref: str
    created_at: datetime
    geofence_triggered_at: datetime | None
    notified_institute_at: datetime | None
    dispatch_time: datetime | None = None
    status: str | None = "assigned"
    priority: str | None = "normal"
    strategy: str | None = None
    seed_commitment: str | None = None
    instructions: list[str] | None = None

    model_config = {"from_attributes": True}


class AssignmentDetailOut(AssignmentOut):
    """Assignment with its institute embedded - what Nayan's visit list reads."""
    due_at: datetime | None = None
    inspector_name: str | None = None
    institute: InstituteOut | None = None


class GenerateRequest(BaseModel):
    """Optional body for POST /assignments/generate.

    With no body the server runs its own CSPRNG draw (Sentinel). Nayan's
    officials may send the result of a verifiable client-side draw instead;
    the server re-checks the fairness rules before accepting it."""
    institute_id: str | None = None
    inspector_id: str | None = None
    dispatch_time: datetime | None = None
    strategy: str | None = Field(default=None, max_length=15)
    seed_commitment: str | None = Field(default=None, max_length=64)
    instructions: list[str] | None = None
    priority: str | None = None


class GeofencePingRequest(BaseModel):
    latitude: float
    longitude: float
