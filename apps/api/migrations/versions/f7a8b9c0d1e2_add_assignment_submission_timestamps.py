"""add assignment submission timestamps

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-03-08 10:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f7a8b9c0d1e2"
down_revision: str | None = "e6f7a8b9c0d1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "assignmentusersubmission", sa.Column("submitted_at", sa.Text(), nullable=True)
    )
    op.add_column(
        "assignmentusersubmission", sa.Column("graded_at", sa.Text(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("assignmentusersubmission", "graded_at")
    op.drop_column("assignmentusersubmission", "submitted_at")
