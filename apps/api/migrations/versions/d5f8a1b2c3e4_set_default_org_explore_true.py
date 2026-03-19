"""Set default org 'openu' as discoverable

Revision ID: d5f8a1b2c3e4
Revises: c4a1e8f73b92
Create Date: 2026-02-07 13:00:00.000000
"""

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = "d5f8a1b2c3e4"
down_revision = "c4a1e8f73b92"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Enable public discovery for the default organization (dev convenience).

    This is intentionally narrow: it only flips `explore` to TRUE for the
    organization with slug 'openu' if it exists. It is reversible.
    """
    conn = op.get_bind()
    print("Setting `explore = TRUE` on organization with slug 'openu' if present...")
    conn.execute(
        text("UPDATE organization SET explore = TRUE WHERE slug = :slug"),
        {"slug": "openu"},
    )


def downgrade() -> None:
    """Revert the `explore` flag back to FALSE for 'openu'."""
    conn = op.get_bind()
    print(
        "Reverting `explore` to FALSE on organization with slug 'openu' if present..."
    )
    conn.execute(
        text("UPDATE organization SET explore = FALSE WHERE slug = :slug"),
        {"slug": "openu"},
    )
