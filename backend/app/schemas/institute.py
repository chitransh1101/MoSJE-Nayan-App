from datetime import datetime

from pydantic import BaseModel, Field

INSTITUTE_TYPES = ("shelter", "skill_center", "ngo", "rehab", "hostel", "old_age_home", "rehab_centre", "school")


class InstituteCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    type: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    district: str | None = None
    state: str | None = None


class InstituteOut(BaseModel):
    id: str
    name: str
    type: str
    latitude: float
    longitude: float
    district: str | None
    state: str | None
    compliance_score: float
    status: str
    renewal_status: str

    model_config = {"from_attributes": True}


class InstituteDetailOut(InstituteOut):
    """Setu's institute page."""
    address: str | None = None
    capacity: int | None = None
    residents: int | None = None
    registration_no: str | None = None
    registration_valid_until: str | None = None
    superintendent: str | None = None
    last_inspection_at: datetime | None = None
    score_history: list[float] | None = None
