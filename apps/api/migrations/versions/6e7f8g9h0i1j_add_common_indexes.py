"""add_common_indexes

Revision ID: 6e7f8g9h0i1j
Revises: 5d6e7f8g9h0i
Create Date: 2026-02-11 00:40:00.000000

"""

import contextlib
from collections.abc import Sequence
from typing import Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "6e7f8g9h0i1j"
down_revision: str | None = "5d6e7f8g9h0i"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Indexes to improve common filters
    with contextlib.suppress(Exception):
        op.create_index("idx_activity_type", "activity", ["activity_type"])
    with contextlib.suppress(Exception):
        op.create_index("idx_activity_published", "activity", ["published"])


def downgrade() -> None:
    with contextlib.suppress(Exception):
        op.drop_index("idx_activity_type", table_name="activity")
    with contextlib.suppress(Exception):
        op.drop_index("idx_activity_published", table_name="activity")
