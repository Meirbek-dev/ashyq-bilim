"""remove org creator_id and rename organization permissions to platform

Revision ID: g1h2i3j4k5l6
Revises: f94740bedd61
Create Date: 2026-03-19 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

revision: str = "g1h2i3j4k5l6"
down_revision: str | None = "f94740bedd61"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(conn: sa.Connection, table_name: str, column_name: str) -> bool:
    if not sa.inspect(conn).has_table(table_name):
        return False
    return any(
        col["name"] == column_name for col in sa.inspect(conn).get_columns(table_name)
    )


def _drop_fk_for_column(conn: sa.Connection, table_name: str, column_name: str) -> None:
    for fk in sa.inspect(conn).get_foreign_keys(table_name):
        constrained = fk.get("constrained_columns") or []
        if column_name in constrained and fk.get("name"):
            op.drop_constraint(fk["name"], table_name, type_="foreignkey")
            return


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Drop creator_id from the organization table
    if _column_exists(conn, "organization", "creator_id"):
        _drop_fk_for_column(conn, "organization", "creator_id")
        op.drop_column("organization", "creator_id")

    # 2. Rename resource_type from 'organization' to 'platform' in permissions table
    conn.execute(
        text(
            """
            UPDATE permissions
            SET resource_type = 'platform',
                name = REPLACE(name, 'organization:', 'platform:')
            WHERE resource_type = 'organization'
            """
        )
    )

    # 3. Update role_permissions entries that reference renamed permissions
    #    (role_permissions links by id, so the name update above is sufficient)

    # 4. Seed new platform:* permissions for existing roles that had organization:* permissions.
    #    The SYSTEM_ROLES in code no longer have organization:* entries (admin uses *:*:*)
    #    so this migration only needs to handle the data rename done above.


def downgrade() -> None:
    conn = op.get_bind()

    # Reverse: rename 'platform' resource_type back to 'organization'
    conn.execute(
        text(
            """
            UPDATE permissions
            SET resource_type = 'organization',
                name = REPLACE(name, 'platform:', 'organization:')
            WHERE resource_type = 'platform'
            """
        )
    )

    # Restore creator_id column (nullable)
    if not _column_exists(conn, "organization", "creator_id"):
        op.add_column(
            "organization",
            sa.Column(
                "creator_id",
                sa.BigInteger(),
                sa.ForeignKey("user.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
