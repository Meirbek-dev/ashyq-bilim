"""remove_scripts_from_organization

Revision ID: 07313a236e8b
Revises: 4f8a0d2b3c5e
Create Date: 2026-02-27 20:10:51.263614

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = "07313a236e8b"
down_revision: str | None = "4f8a0d2b3c5e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_column("organization", "scripts")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        "organization",
        sa.Column("scripts", JSONB(astext_type=sa.Text()), nullable=True),
    )
