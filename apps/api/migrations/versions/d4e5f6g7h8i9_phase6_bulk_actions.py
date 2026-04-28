"""phase6 bulk actions

Revision ID: d4e5f6g7h8i9
Revises: c3d4e5f6g7h8
Create Date: 2026-04-28 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6g7h8i9"
down_revision: str | Sequence[str] | None = "c3d4e5f6g7h8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "bulk_action",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("action_uuid", sa.String(), nullable=False),
        sa.Column("performed_by", sa.Integer(), nullable=False),
        sa.Column("action_type", sa.String(), nullable=False),
        sa.Column("params", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("target_user_ids", sa.JSON(), server_default="[]", nullable=False),
        sa.Column("activity_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), server_default="PENDING", nullable=False),
        sa.Column("affected_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("error_log", sa.Text(), server_default="", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["activity_id"], ["activity.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["performed_by"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_bulk_action_uuid", "bulk_action", ["action_uuid"])
    op.create_index(
        "ix_bulk_action_activity_status",
        "bulk_action",
        ["activity_id", "status"],
    )
    op.create_index(
        "ix_bulk_action_performed_by",
        "bulk_action",
        ["performed_by"],
    )


def downgrade() -> None:
    op.drop_index("ix_bulk_action_performed_by", table_name="bulk_action")
    op.drop_index("ix_bulk_action_activity_status", table_name="bulk_action")
    op.drop_index("ix_bulk_action_uuid", table_name="bulk_action")
    op.drop_table("bulk_action")
