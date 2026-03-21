"""remove platform org identifiers

Revision ID: f94740bedd61
Revises: ef15320fc8ff
Create Date: 2026-03-17 23:59:28.657285

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f94740bedd61"
down_revision: str | None = "ef15320fc8ff"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _table_exists(conn: sa.Connection, table_name: str) -> bool:
    return sa.inspect(conn).has_table(table_name)


def _column_exists(conn: sa.Connection, table_name: str, column_name: str) -> bool:
    if not _table_exists(conn, table_name):
        return False
    return any(
        column["name"] == column_name
        for column in sa.inspect(conn).get_columns(table_name)
    )


def _drop_fk_for_column(conn: sa.Connection, table_name: str, column_name: str) -> None:
    if not _table_exists(conn, table_name):
        return

    for foreign_key in sa.inspect(conn).get_foreign_keys(table_name):
        constrained = foreign_key.get("constrained_columns") or []
        if column_name in constrained and foreign_key.get("name"):
            op.drop_constraint(foreign_key["name"], table_name, type_="foreignkey")
            return


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()

    if _table_exists(conn, "organizationconfig"):
        op.drop_table("organizationconfig")

    for table_name in ("code_submission", "hint_usage"):
        if _column_exists(conn, table_name, "org_id"):
            _drop_fk_for_column(conn, table_name, "org_id")
            op.drop_column(table_name, "org_id")

    if _column_exists(conn, "organization", "org_uuid"):
        op.drop_column("organization", "org_uuid")

    if _column_exists(conn, "organization", "slug"):
        op.drop_column("organization", "slug")


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()

    if _table_exists(conn, "organization") and not _column_exists(
        conn, "organization", "org_uuid"
    ):
        op.add_column("organization", sa.Column("org_uuid", sa.String(), nullable=True))
        op.execute(
            "UPDATE organization SET org_uuid = 'platform' WHERE org_uuid IS NULL"
        )
        op.alter_column("organization", "org_uuid", nullable=False)

    if _table_exists(conn, "organization") and not _column_exists(
        conn, "organization", "slug"
    ):
        op.add_column("organization", sa.Column("slug", sa.String(), nullable=True))
        op.execute("UPDATE organization SET slug = 'platform' WHERE slug IS NULL")
        op.alter_column("organization", "slug", nullable=False)

    for table_name in ("code_submission", "hint_usage"):
        if _table_exists(conn, table_name) and not _column_exists(
            conn, table_name, "org_id"
        ):
            op.add_column(
                table_name, sa.Column("org_id", sa.BigInteger(), nullable=True)
            )
            op.create_foreign_key(
                f"{table_name}_org_id_fkey",
                table_name,
                "organization",
                ["org_id"],
                ["id"],
                ondelete="CASCADE",
            )

    if not _table_exists(conn, "organizationconfig"):
        op.create_table(
            "organizationconfig",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("org_id", sa.Integer(), nullable=False),
            sa.Column(
                "config",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column("creation_date", sa.Text(), nullable=True),
            sa.Column("update_date", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(
                ["org_id"], ["organization.id"], ondelete="CASCADE"
            ),
            sa.UniqueConstraint("org_id", name="uq_organizationconfig_org_id"),
        )
