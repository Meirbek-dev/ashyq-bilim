"""add exam_attempt index and drop legacy quiz tables

Revision ID: f1a2b3c4d5e6
Revises: d88e6a4f9403
Create Date: 2026-02-11 00:00:00.000000

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: str | None = "d88e6a4f9403"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add compound index on ExamAttempt for attempt-limit queries
    op.create_index(
        "idx_exam_attempt_exam_user",
        "examattempt",
        ["exam_id", "user_id"],
    )


def downgrade() -> None:
    # Remove the exam_attempt index
    op.drop_index("idx_exam_attempt_exam_user", table_name="examattempt")
