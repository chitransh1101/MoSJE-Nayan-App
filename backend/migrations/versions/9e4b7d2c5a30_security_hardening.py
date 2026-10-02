"""security hardening: server-side sessions, sign-in throttle, 2-step verification, account state

Revision ID: 9e4b7d2c5a30
Revises: 7c2e1a9d0f11
Create Date: 2026-09-27 19:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

import app.db.types

revision: str = "9e4b7d2c5a30"
down_revision: Union[str, None] = "7c2e1a9d0f11"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

GUID = app.db.types.GUID

USER_COLUMNS = [
    ("is_active", sa.Boolean(), False, sa.true()),
    ("password_changed_at", sa.DateTime(), True, None),
    ("last_login_at", sa.DateTime(), True, None),
    ("last_login_ip", sa.String(64), True, None),
    ("mfa_enabled", sa.Boolean(), False, sa.false()),
    ("mfa_secret_enc", sa.Text(), True, None),
    ("mfa_recovery_hashes", sa.JSON(), True, None),
    ("mfa_last_step", sa.Integer(), True, None),
]


def upgrade() -> None:
    with op.batch_alter_table("users") as b:
        for name, col, nullable, default in USER_COLUMNS:
            b.add_column(sa.Column(name, col, nullable=nullable, server_default=default))

    op.create_table(
        "auth_sessions",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("user_id", GUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_reason", sa.String(40), nullable=True),
        sa.Column("ip", sa.String(64), nullable=True),
        sa.Column("device", sa.String(80), nullable=True),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])

    op.create_table(
        "login_throttle",
        sa.Column("key", sa.String(255), primary_key=True),
        sa.Column("failures", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("first_failure_at", sa.DateTime(), nullable=True),
        sa.Column("locked_until", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("login_throttle")
    op.drop_index("ix_auth_sessions_user_id", table_name="auth_sessions")
    op.drop_table("auth_sessions")
    with op.batch_alter_table("users") as b:
        for name, *_ in reversed(USER_COLUMNS):
            b.drop_column(name)
