"""add active_learners_90d to teacher rollups

Revision ID: b2c3d4e5f6a7
Revises: f9c0d1e2f3a4
Create Date: 2026-03-09 15:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: str | None = "f9c0d1e2f3a4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "daily_teacher_metrics",
        sa.Column(
            "active_learners_90d", sa.Integer(), nullable=False, server_default="0"
        ),
    )
    op.alter_column("daily_teacher_metrics", "active_learners_90d", server_default=None)


def downgrade() -> None:
    op.drop_column("daily_teacher_metrics", "active_learners_90d")
