"""remove_explore_column_from_organization

Revision ID: b32f34573336
Revises: d5f8a1b2c3e4
Create Date: 2026-02-07 22:26:48.635716

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b32f34573336"
down_revision: str | None = "d5f8a1b2c3e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Remove the explore column from organization table."""
    op.drop_column("organization", "explore")


def downgrade() -> None:
    """Re-add the explore column to organization table."""
    op.add_column(
        "organization",
        sa.Column("explore", sa.Boolean(), nullable=True, server_default=sa.false()),
    )
