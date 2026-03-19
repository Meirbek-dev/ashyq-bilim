"""merge heads: e1a2b3c4d5f6 & 7f8g9h0i1j2k

Revision ID: 5b281ae3408c
Revises: e1a2b3c4d5f6, 7f8g9h0i1j2k
Create Date: 2026-02-19 04:17:48.208591

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5b281ae3408c"
down_revision: str | None = ("e1a2b3c4d5f6", "7f8g9h0i1j2k")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
