"""fix submission timestamps to TIMESTAMPTZ

Revision ID: a1b2c3d4e5f6
Revises: f7a8b9c0d1e2
Create Date: 2026-03-09 12:00:00.000000

Convert submitted_at and graded_at on assignmentusersubmission from plain Text
to TIMESTAMP WITH TIME ZONE so that grading-latency percentile metrics are
reliable and timezone-aware comparisons are correct.

The USING clause parses any existing ISO-8601 strings to timestamptz.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "f7a8b9c0d1e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Nullify any values that cannot be cast to keep the migration safe on dirty data.
    op.execute(
        """
        UPDATE assignmentusersubmission
        SET submitted_at = NULL
        WHERE submitted_at IS NOT NULL
          AND submitted_at !~ '^\\d{4}-\\d{2}-\\d{2}'
        """
    )
    op.execute(
        """
        UPDATE assignmentusersubmission
        SET graded_at = NULL
        WHERE graded_at IS NOT NULL
          AND graded_at !~ '^\\d{4}-\\d{2}-\\d{2}'
        """
    )
    op.alter_column(
        "assignmentusersubmission",
        "submitted_at",
        existing_type=sa.Text(),
        type_=sa.TIMESTAMP(timezone=True),
        existing_nullable=True,
        postgresql_using="submitted_at::timestamp with time zone",
    )
    op.alter_column(
        "assignmentusersubmission",
        "graded_at",
        existing_type=sa.Text(),
        type_=sa.TIMESTAMP(timezone=True),
        existing_nullable=True,
        postgresql_using="graded_at::timestamp with time zone",
    )


def downgrade() -> None:
    op.alter_column(
        "assignmentusersubmission",
        "submitted_at",
        existing_type=sa.TIMESTAMP(timezone=True),
        type_=sa.Text(),
        existing_nullable=True,
    )
    op.alter_column(
        "assignmentusersubmission",
        "graded_at",
        existing_type=sa.TIMESTAMP(timezone=True),
        type_=sa.Text(),
        existing_nullable=True,
    )
