"""ci_user_email_unique

Revision ID: 4c5d6e7f8g9h
Revises: 3b4c5d6e7f8g
Create Date: 2026-02-11 00:20:00.000000

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4c5d6e7f8g9h"
down_revision: str | None = "3b4c5d6e7f8g"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEX_NAME = "uq_user_email_lower"


def upgrade() -> None:
    conn = op.get_bind()
    # Check for case-insensitive duplicates
    dup_stmt = sa.text(
        'SELECT lower(email) AS e, count(*) FROM "user" GROUP BY lower(email) HAVING count(*) > 1 LIMIT 10'
    )
    res = conn.execute(dup_stmt).fetchall()
    if res:
        msg = f"Cannot create case-insensitive unique index on user.email because duplicates found: {res}"
        raise RuntimeError(msg)

    # Create a unique index on lower(email)
    op.execute(f'CREATE UNIQUE INDEX {INDEX_NAME} ON "user" (lower(email));')


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {INDEX_NAME};")
