"""
Tables added to connect Sentinel (officials), Setu (institutes and
beneficiaries) and Nayan (inspectors / officials on mobile) to one backend.

Every id is a GUID like the rest of the schema; every JSON column is plain
SQLAlchemy JSON, which maps to JSON on Postgres and TEXT on SQLite.
"""
from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utcnow
from app.db.base import Base
from app.db.types import GUID, new_uuid


class BeneficiaryProfile(Base):
    """The resident record behind Setu's "My status" page and the staff roster."""

    __tablename__ = "beneficiary_profiles"

    user_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("users.id"), primary_key=True)
    beneficiary_code: Mapped[str] = mapped_column(String(40), nullable=False)  # e.g. BEN-UP-LUC-00417
    gender: Mapped[str] = mapped_column(String(2), nullable=True)
    age: Mapped[int] = mapped_column(Integer, nullable=True)
    date_of_birth: Mapped[str] = mapped_column(String(10), nullable=True)
    tags: Mapped[object] = mapped_column(JSON, nullable=True)  # child/student/sc/obc/senior/rehab/youth/school
    category: Mapped[str] = mapped_column(String(80), nullable=True)
    admitted_on: Mapped[object] = mapped_column(DateTime, nullable=True)
    room: Mapped[str] = mapped_column(String(60), nullable=True)
    guardian: Mapped[str] = mapped_column(String(120), nullable=True)
    case_worker: Mapped[str] = mapped_column(String(160), nullable=True)
    phone_masked: Mapped[str] = mapped_column(String(30), nullable=True)
    health: Mapped[object] = mapped_column(JSON, nullable=True)  # {last_checkup, next_checkup, notes}
    education: Mapped[object] = mapped_column(JSON, nullable=True)  # {school, klass, attendance}

    user = relationship("User")


class Scheme(Base):
    """The scheme catalogue (public)."""

    __tablename__ = "schemes"

    key: Mapped[str] = mapped_column(String(30), primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    hi: Mapped[str] = mapped_column(String(200), nullable=True)
    office: Mapped[str] = mapped_column(String(160), nullable=True)  # template, {state} / {district}
    amount: Mapped[float] = mapped_column(Float, nullable=True)
    period: Mapped[str] = mapped_column(String(20), nullable=True)  # "per month" / "per year"
    instalments: Mapped[int] = mapped_column(Integer, default=1)
    audience: Mapped[object] = mapped_column(JSON, nullable=True)  # tags that make someone eligible
    about: Mapped[str] = mapped_column(Text, nullable=True)
    documents: Mapped[object] = mapped_column(JSON, nullable=True)  # document keys needed


class SchemeApplication(Base):
    """One beneficiary's application to one scheme. Stages, payments and the
    next step are derived from these columns at read time (services/benefits.py)."""

    __tablename__ = "scheme_applications"

    id: Mapped[GUID] = mapped_column(GUID, primary_key=True, default=new_uuid)
    user_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("users.id"), nullable=False, index=True)
    scheme_key: Mapped[str] = mapped_column(String(30), ForeignKey("schemes.key"), nullable=False)
    application_no: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(15), default="pending")  # pending/approved/active/rejected
    stages_reached: Mapped[int] = mapped_column(Integer, default=1)  # 1 applied .. 4 disbursed
    applied_at: Mapped[object] = mapped_column(DateTime, default=utcnow)
    blocking_document: Mapped[str] = mapped_column(String(20), nullable=True)
    delayed: Mapped[bool] = mapped_column(Boolean, default=False)
    requested_by_beneficiary: Mapped[bool] = mapped_column(Boolean, default=False)

    scheme = relationship("Scheme")


class BeneficiaryDocument(Base):
    __tablename__ = "beneficiary_documents"

    id: Mapped[GUID] = mapped_column(GUID, primary_key=True, default=new_uuid)
    user_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("users.id"), nullable=False, index=True)
    key: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    hi: Mapped[str] = mapped_column(String(160), nullable=True)
    status: Mapped[str] = mapped_column(String(15), default="verified")  # verified/pending/rejected/not_required
    required: Mapped[bool] = mapped_column(Boolean, default=True)
    verified_on: Mapped[object] = mapped_column(DateTime, nullable=True)
    verified_by: Mapped[str] = mapped_column(String(120), nullable=True)
    remark: Mapped[str] = mapped_column(String(300), nullable=True)


class Notice(Base):
    """Department notices shown on Setu's notice board."""

    __tablename__ = "notices"

    id: Mapped[GUID] = mapped_column(GUID, primary_key=True, default=new_uuid)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    audience: Mapped[str] = mapped_column(String(20), default="all")  # all/staff/beneficiary
    institute_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("institutes.id"), nullable=True)  # null = everyone
    created_at: Mapped[object] = mapped_column(DateTime, default=utcnow)


class AlertResponse(Base):
    """An institute's written reply to a finding (Setu -> Sentinel)."""

    __tablename__ = "alert_responses"

    id: Mapped[GUID] = mapped_column(GUID, primary_key=True, default=new_uuid)
    alert_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("alerts.id"), nullable=False, index=True)
    user_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("users.id"), nullable=False)
    author_name: Mapped[str] = mapped_column(String(120), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime, default=utcnow)


class CallRequest(Base):
    """A beneficiary asking the Department to call them (Setu)."""

    __tablename__ = "call_requests"

    id: Mapped[GUID] = mapped_column(GUID, primary_key=True, default=new_uuid)
    user_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("users.id"), nullable=False)
    institute_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("institutes.id"), nullable=True)
    preferred_time: Mapped[str] = mapped_column(String(60), nullable=True)
    note: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(15), default="requested")
    created_at: Mapped[object] = mapped_column(DateTime, default=utcnow)


class Inspection(Base):
    """The inspector's filed record: checklist, remarks and the evidence it covers (Nayan)."""

    __tablename__ = "inspections"

    id: Mapped[GUID] = mapped_column(GUID, primary_key=True, default=new_uuid)
    assignment_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("assignments.id"), nullable=False, index=True)
    inspector_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("users.id"), nullable=False)
    institute_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("institutes.id"), nullable=False)
    remarks: Mapped[str] = mapped_column(Text, nullable=True)
    checklist: Mapped[object] = mapped_column(JSON, nullable=True)  # {item_key: yes/no/na}
    evidence_ids: Mapped[object] = mapped_column(JSON, nullable=True)
    client_hashes: Mapped[object] = mapped_column(JSON, nullable=True)
    gps_lat: Mapped[float] = mapped_column(Float, nullable=True)
    gps_lng: Mapped[float] = mapped_column(Float, nullable=True)
    distance_m: Mapped[float] = mapped_column(Float, nullable=True)
    device_id: Mapped[str] = mapped_column(String(255), nullable=True)
    started_at: Mapped[object] = mapped_column(DateTime, nullable=True)
    submitted_at: Mapped[object] = mapped_column(DateTime, default=utcnow)


class InspectorMessage(Base):
    """Official <-> inspector messages ("Connect with inspector" in Sentinel)."""

    __tablename__ = "inspector_messages"

    id: Mapped[GUID] = mapped_column(GUID, primary_key=True, default=new_uuid)
    inspector_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("users.id"), nullable=False, index=True)
    direction: Mapped[str] = mapped_column(String(15), nullable=False)  # to_inspector/from_inspector
    sender_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("users.id"), nullable=True)
    sender_name: Mapped[str] = mapped_column(String(120), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(String(20), default="message")  # message/instruction/update_request
    priority: Mapped[str] = mapped_column(String(10), default="normal")  # normal/urgent
    institute_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("institutes.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(10), default="sent")  # sent/delivered/read
    created_at: Mapped[object] = mapped_column(DateTime, default=utcnow)


class AuditEntry(Base):
    """Hash-chained audit log. hash = SHA-256 of
    prev_hash|id|at|actor_id|action|entity_type|entity_id|detail - the same
    canonical string Sentinel recomputes to prove no row was edited."""

    __tablename__ = "audit_log"

    id: Mapped[GUID] = mapped_column(GUID, primary_key=True, default=new_uuid)
    seq: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    at: Mapped[str] = mapped_column(String(40), nullable=False)  # ISO string exactly as hashed
    actor_id: Mapped[str] = mapped_column(String(36), nullable=True)
    actor_name: Mapped[str] = mapped_column(String(120), nullable=True)
    actor_role: Mapped[str] = mapped_column(String(30), nullable=True)
    action: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(30), nullable=True)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=True)
    entity_label: Mapped[str] = mapped_column(String(200), nullable=True)
    detail: Mapped[str] = mapped_column(Text, nullable=True)
    before: Mapped[object] = mapped_column(JSON, nullable=True)
    after: Mapped[object] = mapped_column(JSON, nullable=True)
    prev_hash: Mapped[str] = mapped_column(String(64), nullable=True)
    hash: Mapped[str] = mapped_column(String(64), nullable=False)


class AttendanceDaily(Base):
    """Daily roll-up per institute - what the attendance charts and the
    anomaly checks read (Nayan insights, Sentinel analytics)."""

    __tablename__ = "attendance_daily"

    id: Mapped[GUID] = mapped_column(GUID, primary_key=True, default=new_uuid)
    institute_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("institutes.id"), nullable=False, index=True)
    date: Mapped[object] = mapped_column(Date, nullable=False)
    present: Mapped[int] = mapped_column(Integer, default=0)
    enrolled: Mapped[int] = mapped_column(Integer, default=0)
    staff_present: Mapped[int] = mapped_column(Integer, default=0)
    staff_total: Mapped[int] = mapped_column(Integer, default=0)
    camera_uptime: Mapped[float] = mapped_column(Float, default=1.0)
