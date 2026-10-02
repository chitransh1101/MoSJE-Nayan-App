"""Scheme catalogue (public) and the beneficiary's own record (Setu)."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.core.time import utcnow
from app.db.base import get_db
from app.db.models.extras import Scheme, SchemeApplication
from app.db.models.institute import Institute
from app.db.models.user import User
from app.services import audit
from app.services.benefits import application_view, beneficiary_view

router = APIRouter(prefix="/api/v1", tags=["schemes"])


class SchemeRequestIn(BaseModel):
    scheme_key: str = Field(max_length=30)


def scheme_view(s: Scheme) -> dict:
    return {
        "key": s.key, "name": s.name, "hi": s.hi, "amount": s.amount, "period": s.period,
        "audience": s.audience or [], "about": s.about, "documents": s.documents or [],
    }


@router.get("/schemes")
def catalogue(db: Session = Depends(get_db)):
    return [scheme_view(s) for s in db.query(Scheme).order_by(Scheme.name).all()]


@router.get("/beneficiaries/me")
def me(db: Session = Depends(get_db), user: User = Depends(require_role("beneficiary"))):
    return beneficiary_view(db, user)


@router.post("/beneficiaries/me/scheme-requests", status_code=201)
def request_scheme(payload: SchemeRequestIn, db: Session = Depends(get_db), user: User = Depends(require_role("beneficiary"))):
    scheme = db.get(Scheme, payload.scheme_key)
    if not scheme:
        raise HTTPException(status_code=404, detail="Scheme not found")
    existing = db.query(SchemeApplication).filter(
        SchemeApplication.user_id == user.id, SchemeApplication.scheme_key == scheme.key
    ).first()
    if existing and existing.status != "rejected":
        raise HTTPException(status_code=409, detail="You already have an application for this scheme")
    inst = db.get(Institute, user.institute_id) if user.institute_id else None
    n = db.query(SchemeApplication).count() + 1
    code = {"Uttar Pradesh": "UP", "Bihar": "BR", "Maharashtra": "MH"}.get(inst.state if inst else "", "IN")
    app = SchemeApplication(
        user_id=user.id, scheme_key=scheme.key,
        application_no=f"{scheme.key.upper().replace('_', '')}/{code}/{utcnow().year}/{10000 + n}",
        status="pending", stages_reached=1, applied_at=utcnow(), requested_by_beneficiary=True,
    )
    db.add(app)
    db.commit()
    db.refresh(app)
    audit.record(db, user, action="scheme.requested", entity_type="scheme", entity_id=scheme.key, entity_label=scheme.name)
    return application_view(app, inst)
