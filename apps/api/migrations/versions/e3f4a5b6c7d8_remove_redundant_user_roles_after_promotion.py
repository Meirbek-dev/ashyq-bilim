"""Remove redundant lower-priority user_roles for promoted users

Revision ID: e3f4a5b6c7d8
Revises: 30d136b8fc44
Create Date: 2026-02-22 18:00:00.000000

When a user is assigned a higher-priority role (e.g. admin), the old
lower-priority role assigned during initial seeding is not automatically removed.
This migration strips out any "user" role (priority 10) assignment for users who
also hold a higher-priority role in the same org.

Concretely, the only affected row in the current dataset is:
  user_id=1, role_id=6 (user), org_id=1, id=20
which became redundant when user 1 was promoted to admin (role_id=1).
"""

from collections.abc import Sequence
from typing import Union

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "e3f4a5b6c7d8"
down_revision: str | None = "30d136b8fc44"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Keep user_roles intact.

    Previous version removed lower-priority roles for promoted users. That can
    cause accidental loss of expected assignments during drifted/stamped
    environments. We intentionally preserve all rows here.
    """
    print("[Migration] Data-preserving mode: no user_roles rows deleted.")


def downgrade() -> None:
    """Non-reversible – deleted rows cannot be restored automatically."""
    print("[Migration] Downgrade: redundant rows are not restored.")
