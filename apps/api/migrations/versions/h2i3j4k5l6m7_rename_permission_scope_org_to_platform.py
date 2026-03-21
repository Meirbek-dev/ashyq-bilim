"""rename permission scope org to platform

Revision ID: h2i3j4k5l6m7
Revises: g1h2i3j4k5l6
Create Date: 2026-03-20 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "h2i3j4k5l6m7"
down_revision: str | None = "g1h2i3j4k5l6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(conn: sa.Connection, table_name: str, column_name: str) -> bool:
    if not sa.inspect(conn).has_table(table_name):
        return False
    return any(
        col["name"] == column_name for col in sa.inspect(conn).get_columns(table_name)
    )


def upgrade() -> None:
    conn = op.get_bind()

    conn.exec_driver_sql(
        """
        UPDATE permissions
        SET scope = 'platform',
            name = REPLACE(name, ':org', ':platform'),
            description = CASE
                WHEN description IS NULL THEN NULL
                ELSE REPLACE(description, ' organization', ' platform')
            END
        WHERE scope = 'org' OR name LIKE '%%:org'
        """
    )

    if _column_exists(conn, "permissions", "permission_key"):
        conn.exec_driver_sql(
            """
            UPDATE permissions
            SET permission_key = REPLACE(permission_key, ':org', ':platform')
            WHERE permission_key LIKE '%%:org'
            """
        )


def downgrade() -> None:
    conn = op.get_bind()

    conn.exec_driver_sql(
        """
        UPDATE permissions
        SET scope = 'org',
            name = REPLACE(name, ':platform', ':org'),
            description = CASE
                WHEN description IS NULL THEN NULL
                ELSE REPLACE(description, ' platform', ' organization')
            END
        WHERE scope = 'platform' AND name LIKE '%%:platform'
        """
    )

    if _column_exists(conn, "permissions", "permission_key"):
        conn.exec_driver_sql(
            """
            UPDATE permissions
            SET permission_key = REPLACE(permission_key, ':platform', ':org')
            WHERE permission_key LIKE '%%:platform'
            """
        )
