import uuid

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user, require_role
from app.db.base import get_db
from app.db.models.institute_document import InstituteDocument
from app.db.models.user import User
from app.schemas.institute_document import InstituteDocumentOut
from app.services.storage import DOCUMENT_TYPES, extension_ok, get_storage, safe_filename

router = APIRouter(prefix="/api/v1/institutes", tags=["institute-documents"])


@router.post("/{institute_id}/documents", response_model=InstituteDocumentOut, status_code=201)
async def upload_document(
    institute_id: str,
    file: UploadFile,
    description: str | None = Form(default=None),
    alert_id: str | None = Form(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_role("institute_staff")),
):
    if str(user.institute_id) != str(institute_id):
        raise HTTPException(status_code=403, detail="You can only upload documents for your own institute")

    if not extension_ok(file.filename, DOCUMENT_TYPES):
        raise HTTPException(status_code=415, detail="This file type isn't accepted. Upload PDF, an image, or an office document.")
    contents = await file.read()
    if len(contents) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File too large. The limit is {settings.MAX_UPLOAD_MB} MB.")
    if not contents:
        raise HTTPException(status_code=400, detail="The file is empty.")
    storage = get_storage()
    key = f"institute-documents/{user.institute_id}/{uuid.uuid4().hex[:8]}_{safe_filename(file.filename, 'document')}"
    file_url = storage.save(key, contents)

    doc = InstituteDocument(
        institute_id=institute_id,
        alert_id=alert_id,
        uploaded_by_id=user.id,
        file_url=file_url,
        description=description,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/{institute_id}/documents", response_model=list[InstituteDocumentOut])
def list_documents(
    institute_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role in ("institute_staff", "beneficiary") and str(user.institute_id) != str(institute_id):
        raise HTTPException(status_code=403, detail="You can only view your own institute's documents")
    if user.role not in ("official", "admin", "institute_staff", "beneficiary"):
        raise HTTPException(status_code=403, detail="Not permitted to view documents")

    return (
        db.query(InstituteDocument)
        .filter(InstituteDocument.institute_id == institute_id)
        .order_by(InstituteDocument.uploaded_at.desc())
        .all()
    )
