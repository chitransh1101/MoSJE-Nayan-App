from datetime import datetime

from pydantic import BaseModel


class InstituteDocumentOut(BaseModel):
    id: str
    institute_id: str
    alert_id: str | None
    uploaded_by_id: str
    file_url: str
    description: str | None
    uploaded_at: datetime

    model_config = {"from_attributes": True}
