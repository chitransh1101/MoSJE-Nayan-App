"""connect Sentinel, Setu and Nayan: profiles, schemes, inspections, messages, audit, attendance

Revision ID: 7c2e1a9d0f11
Revises: 4b1fdea9cbae
Create Date: 2026-09-27 16:30:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

import app.db.types

revision: str = "7c2e1a9d0f11"
down_revision: Union[str, None] = "4b1fdea9cbae"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

GUID = app.db.types.GUID


def upgrade() -> None:
    # --- new columns on existing tables --------------------------------
    for name, col in [
        ("designation", sa.String(120)), ("employee_id", sa.String(40)),
        ("district", sa.String(100)), ("state", sa.String(100)),
    ]:
        op.add_column("users", sa.Column(name, col, nullable=True))

    for name, col in [
        ("address", sa.String(255)), ("capacity", sa.Integer()), ("residents_count", sa.Integer()),
        ("registration_no", sa.String(60)), ("registration_valid_until", sa.String(10)),
        ("superintendent", sa.String(120)), ("last_inspection_at", sa.DateTime()), ("score_history", sa.JSON()),
    ]:
        op.add_column("institutes", sa.Column(name, col, nullable=True))

    op.add_column("assignments", sa.Column("dispatch_time", sa.DateTime(), nullable=True))
    op.add_column("assignments", sa.Column("status", sa.String(15), nullable=True, server_default="assigned"))
    op.add_column("assignments", sa.Column("priority", sa.String(10), nullable=True, server_default="normal"))
    op.add_column("assignments", sa.Column("strategy", sa.String(15), nullable=True))
    op.add_column("assignments", sa.Column("seed_commitment", sa.String(64), nullable=True))
    op.add_column("assignments", sa.Column("instructions", sa.JSON(), nullable=True))

    op.add_column("camera_feeds", sa.Column("snapshot_url", sa.String(500), nullable=True))
    op.add_column("camera_feeds", sa.Column("stream_url", sa.String(500), nullable=True))

    op.add_column("evidence", sa.Column("kind", sa.String(10), nullable=True, server_default="photo"))
    op.add_column("evidence", sa.Column("distance_m", sa.Float(), nullable=True))

    op.add_column("grievances", sa.Column("category", sa.String(30), nullable=True))
    op.add_column("grievances", sa.Column("urgency", sa.String(10), nullable=True, server_default="normal"))
    op.add_column("grievances", sa.Column("confidential", sa.Boolean(), nullable=True, server_default=sa.false()))
    op.add_column("grievances", sa.Column("escalation_level", sa.Integer(), nullable=True, server_default="1"))
    op.add_column("grievances", sa.Column("escalated_at", sa.DateTime(), nullable=True))
    op.add_column("grievances", sa.Column("sla_due_at", sa.DateTime(), nullable=True))
    op.add_column("grievances", sa.Column("updates", sa.JSON(), nullable=True))

    with op.batch_alter_table("vc_calls") as b:
        b.alter_column("beneficiary_id", existing_type=GUID(), nullable=True)
        b.add_column(sa.Column("participant_name", sa.String(120), nullable=True))
        b.add_column(sa.Column("participant_role", sa.String(20), nullable=True))
        b.add_column(sa.Column("called_by_id", GUID(), nullable=True))
        b.add_column(sa.Column("called_by_name", sa.String(120), nullable=True))
        b.add_column(sa.Column("room", sa.String(80), nullable=True))
        b.add_column(sa.Column("outcome", sa.String(20), nullable=True, server_default="pending"))
        b.add_column(sa.Column("identity_ok", sa.Boolean(), nullable=True))
        b.add_column(sa.Column("premises_shown", sa.Boolean(), nullable=True))
        b.add_column(sa.Column("headcount", sa.Integer(), nullable=True))
        b.add_column(sa.Column("notes", sa.Text(), nullable=True))
        b.add_column(sa.Column("is_random", sa.Boolean(), nullable=True, server_default=sa.true()))
        b.add_column(sa.Column("scheduled_at", sa.DateTime(), nullable=True))
        b.add_column(sa.Column("official_name", sa.String(160), nullable=True))
        b.create_foreign_key("fk_vc_calls_called_by", "users", ["called_by_id"], ["id"])

    # --- new tables ----------------------------------------------------
    op.create_table(
        "beneficiary_profiles",
        sa.Column("user_id", GUID(), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("beneficiary_code", sa.String(40), nullable=False),
        sa.Column("gender", sa.String(2)), sa.Column("age", sa.Integer()), sa.Column("date_of_birth", sa.String(10)),
        sa.Column("tags", sa.JSON()), sa.Column("category", sa.String(80)), sa.Column("admitted_on", sa.DateTime()),
        sa.Column("room", sa.String(60)), sa.Column("guardian", sa.String(120)), sa.Column("case_worker", sa.String(160)),
        sa.Column("phone_masked", sa.String(30)), sa.Column("health", sa.JSON()), sa.Column("education", sa.JSON()),
    )
    op.create_table(
        "schemes",
        sa.Column("key", sa.String(30), primary_key=True),
        sa.Column("name", sa.String(160), nullable=False), sa.Column("hi", sa.String(200)), sa.Column("office", sa.String(160)),
        sa.Column("amount", sa.Float()), sa.Column("period", sa.String(20)), sa.Column("instalments", sa.Integer()),
        sa.Column("audience", sa.JSON()), sa.Column("about", sa.Text()), sa.Column("documents", sa.JSON()),
    )
    op.create_table(
        "scheme_applications",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("user_id", GUID(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("scheme_key", sa.String(30), sa.ForeignKey("schemes.key"), nullable=False),
        sa.Column("application_no", sa.String(40), nullable=False),
        sa.Column("status", sa.String(15)), sa.Column("stages_reached", sa.Integer()),
        sa.Column("applied_at", sa.DateTime()), sa.Column("blocking_document", sa.String(20)),
        sa.Column("delayed", sa.Boolean()), sa.Column("requested_by_beneficiary", sa.Boolean()),
    )
    op.create_table(
        "beneficiary_documents",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("user_id", GUID(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("key", sa.String(20), nullable=False), sa.Column("name", sa.String(120), nullable=False),
        sa.Column("hi", sa.String(160)), sa.Column("status", sa.String(15)), sa.Column("required", sa.Boolean()),
        sa.Column("verified_on", sa.DateTime()), sa.Column("verified_by", sa.String(120)), sa.Column("remark", sa.String(300)),
    )
    op.create_table(
        "notices",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("title", sa.String(200), nullable=False), sa.Column("body", sa.Text(), nullable=False),
        sa.Column("audience", sa.String(20)), sa.Column("institute_id", GUID(), sa.ForeignKey("institutes.id"), nullable=True),
        sa.Column("created_at", sa.DateTime()),
    )
    op.create_table(
        "alert_responses",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("alert_id", GUID(), sa.ForeignKey("alerts.id"), nullable=False, index=True),
        sa.Column("user_id", GUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("author_name", sa.String(120)), sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime()),
    )
    op.create_table(
        "call_requests",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("user_id", GUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("institute_id", GUID(), sa.ForeignKey("institutes.id"), nullable=True),
        sa.Column("preferred_time", sa.String(60)), sa.Column("note", sa.Text()),
        sa.Column("status", sa.String(15)), sa.Column("created_at", sa.DateTime()),
    )
    op.create_table(
        "inspections",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("assignment_id", GUID(), sa.ForeignKey("assignments.id"), nullable=False, index=True),
        sa.Column("inspector_id", GUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("institute_id", GUID(), sa.ForeignKey("institutes.id"), nullable=False),
        sa.Column("remarks", sa.Text()), sa.Column("checklist", sa.JSON()), sa.Column("evidence_ids", sa.JSON()),
        sa.Column("client_hashes", sa.JSON()), sa.Column("gps_lat", sa.Float()), sa.Column("gps_lng", sa.Float()),
        sa.Column("distance_m", sa.Float()), sa.Column("device_id", sa.String(255)),
        sa.Column("started_at", sa.DateTime()), sa.Column("submitted_at", sa.DateTime()),
    )
    op.create_table(
        "inspector_messages",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("inspector_id", GUID(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("direction", sa.String(15), nullable=False),
        sa.Column("sender_id", GUID(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("sender_name", sa.String(120)), sa.Column("body", sa.Text(), nullable=False),
        sa.Column("kind", sa.String(20)), sa.Column("priority", sa.String(10)),
        sa.Column("institute_id", GUID(), sa.ForeignKey("institutes.id"), nullable=True),
        sa.Column("status", sa.String(10)), sa.Column("created_at", sa.DateTime()),
    )
    op.create_table(
        "audit_log",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("seq", sa.Integer(), nullable=False, index=True),
        sa.Column("at", sa.String(40), nullable=False),
        sa.Column("actor_id", sa.String(36)), sa.Column("actor_name", sa.String(120)), sa.Column("actor_role", sa.String(30)),
        sa.Column("action", sa.String(60), nullable=False), sa.Column("entity_type", sa.String(30)),
        sa.Column("entity_id", sa.String(64)), sa.Column("entity_label", sa.String(200)), sa.Column("detail", sa.Text()),
        sa.Column("before", sa.JSON()), sa.Column("after", sa.JSON()),
        sa.Column("prev_hash", sa.String(64)), sa.Column("hash", sa.String(64), nullable=False),
    )
    op.create_table(
        "attendance_daily",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("institute_id", GUID(), sa.ForeignKey("institutes.id"), nullable=False, index=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("present", sa.Integer()), sa.Column("enrolled", sa.Integer()),
        sa.Column("staff_present", sa.Integer()), sa.Column("staff_total", sa.Integer()),
        sa.Column("camera_uptime", sa.Float()),
    )


def downgrade() -> None:
    for t in ["attendance_daily", "audit_log", "inspector_messages", "inspections", "call_requests",
              "alert_responses", "notices", "beneficiary_documents", "scheme_applications", "schemes",
              "beneficiary_profiles"]:
        op.drop_table(t)
    with op.batch_alter_table("vc_calls") as b:
        b.drop_constraint("fk_vc_calls_called_by", type_="foreignkey")
        for c in ["official_name", "scheduled_at", "is_random", "notes", "headcount", "premises_shown", "identity_ok",
                  "outcome", "room", "called_by_name", "called_by_id", "participant_role", "participant_name"]:
            b.drop_column(c)
    for c in ["updates", "sla_due_at", "escalated_at", "escalation_level", "confidential", "urgency", "category"]:
        op.drop_column("grievances", c)
    for c in ["distance_m", "kind"]:
        op.drop_column("evidence", c)
    for c in ["stream_url", "snapshot_url"]:
        op.drop_column("camera_feeds", c)
    for c in ["instructions", "seed_commitment", "strategy", "priority", "status", "dispatch_time"]:
        op.drop_column("assignments", c)
    for c in ["score_history", "last_inspection_at", "superintendent", "registration_valid_until", "registration_no",
              "residents_count", "capacity", "address"]:
        op.drop_column("institutes", c)
    for c in ["state", "district", "employee_id", "designation"]:
        op.drop_column("users", c)
