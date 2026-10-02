"""
Hash-chained audit log.

Each row's hash is SHA-256 over
    prev_hash|id|at|actor_id|action|entity_type|entity_id|detail
which is byte-for-byte the string Sentinel's auditCanonical() builds, so the
browser can re-verify the whole chain and point at the first edited row.
"""
import hashlib
import uuid

from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.db.models.extras import AuditEntry


def canonical(prev_hash: str, entry_id: str, at: str, actor_id: str, action: str, entity_type: str, entity_id: str, detail: str) -> str:
    return "|".join([prev_hash or "", entry_id, at, actor_id or "", action, entity_type or "", entity_id or "", detail or ""])


def record(
    db: Session,
    user=None,
    *,
    action: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    entity_label: str | None = None,
    detail: str | None = None,
    before: dict | None = None,
    after: dict | None = None,
    commit: bool = True,
) -> AuditEntry:
    last = db.query(AuditEntry).order_by(AuditEntry.seq.desc()).first()
    prev_hash = last.hash if last else ""
    seq = (last.seq + 1) if last else 1
    entry_id = str(uuid.uuid4())
    at = utcnow().isoformat(timespec="milliseconds")
    actor_id = str(user.id) if user is not None else ""
    entity_id = str(entity_id) if entity_id is not None else None
    digest = hashlib.sha256(
        canonical(prev_hash, entry_id, at, actor_id, action, entity_type or "", entity_id or "", detail or "").encode("utf-8")
    ).hexdigest()
    entry = AuditEntry(
        id=entry_id,
        seq=seq,
        at=at,
        actor_id=actor_id or None,
        actor_name=getattr(user, "name", None),
        actor_role=getattr(user, "role", None),
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_label=entity_label,
        detail=detail,
        before=before,
        after=after,
        prev_hash=prev_hash or None,
        hash=digest,
    )
    db.add(entry)
    if commit:
        db.commit()
    return entry
