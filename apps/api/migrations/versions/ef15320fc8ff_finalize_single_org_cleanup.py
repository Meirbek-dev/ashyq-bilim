"""finalize single org cleanup

Revision ID: ef15320fc8ff
Revises: 37881a918cc1
Create Date: 2026-03-17 17:27:49.700130

"""

from collections.abc import Sequence
from typing import Union

# revision identifiers, used by Alembic.
revision: str = "ef15320fc8ff"
down_revision: str | None = "37881a918cc1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Checkpoint revision after the destructive multiorg schema purge."""
    return


def downgrade() -> None:
    """No-op downgrade for the checkpoint revision."""
    return
