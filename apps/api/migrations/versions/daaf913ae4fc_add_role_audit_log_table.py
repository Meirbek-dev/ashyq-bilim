"""add role audit log table

Revision ID: daaf913ae4fc
Revises: 9daecf9a5854
Create Date: 2026-02-21 21:15:53.361087

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "daaf913ae4fc"
down_revision: str | None = "9daecf9a5854"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "role_audit_log",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("target_role_id", sa.Integer(), nullable=True),
        sa.Column("target_role_slug", sa.String(length=100), nullable=True),
        sa.Column("org_id", sa.Integer(), nullable=True),
        sa.Column("diff_summary", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["actor_id"], ["user.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["target_role_id"], ["roles.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_role_audit_log_timestamp", "role_audit_log", ["timestamp"])
    op.create_index(
        "ix_role_audit_log_org_timestamp", "role_audit_log", ["org_id", "timestamp"]
    )
    op.create_index(
        "ix_role_audit_log_target_role_id", "role_audit_log", ["target_role_id"]
    )
    op.create_index("ix_role_audit_log_actor_id", "role_audit_log", ["actor_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_role_audit_log_actor_id", table_name="role_audit_log")
    op.drop_index("ix_role_audit_log_target_role_id", table_name="role_audit_log")
    op.drop_index("ix_role_audit_log_org_timestamp", table_name="role_audit_log")
    op.drop_index("ix_role_audit_log_timestamp", table_name="role_audit_log")
    op.drop_table("role_audit_log")
