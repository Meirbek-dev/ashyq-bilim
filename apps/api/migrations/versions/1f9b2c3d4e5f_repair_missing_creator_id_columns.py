"""repair missing creator_id columns after stamped head

Revision ID: 1f9b2c3d4e5f
Revises: f2a3b4c5d6e7
Create Date: 2026-02-24 13:30:00.000000

Ensures creator_id columns and their foreign keys exist even if prior
migrations were stamped without being executed.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "1f9b2c3d4e5f"
down_revision: str | None = "f2a3b4c5d6e7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES: list[tuple[str, str]] = [
    ("organization", "fk_organization_creator_id_user"),
    ("course", "fk_course_creator_id_user"),
    ("chapter", "chapter_creator_id_fkey"),
    ("activity", "fk_activity_creator_id_user"),
    ("collection", "fk_collection_creator_id_user"),
    ("usergroup", "fk_usergroup_creator_id_user"),
]


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    row = conn.execute(
        text(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = :table_name
              AND column_name = :column_name
            """
        ),
        {"table_name": table_name, "column_name": column_name},
    ).fetchone()
    return row is not None


def _fk_exists(conn, table_name: str, fk_name: str) -> bool:
    row = conn.execute(
        text(
            """
            SELECT 1
            FROM information_schema.table_constraints
            WHERE constraint_schema = 'public'
              AND table_name = :table_name
              AND constraint_name = :fk_name
              AND constraint_type = 'FOREIGN KEY'
            """
        ),
        {"table_name": table_name, "fk_name": fk_name},
    ).fetchone()
    return row is not None


def upgrade() -> None:
    conn = op.get_bind()

    for table_name, fk_name in TABLES:
        if not _column_exists(conn, table_name, "creator_id"):
            op.add_column(
                table_name, sa.Column("creator_id", sa.BigInteger(), nullable=True)
            )

        if not _fk_exists(conn, table_name, fk_name):
            op.create_foreign_key(
                fk_name,
                table_name,
                "user",
                ["creator_id"],
                ["id"],
                ondelete="SET NULL",
            )


def downgrade() -> None:
    conn = op.get_bind()

    for table_name, fk_name in TABLES:
        if _fk_exists(conn, table_name, fk_name):
            op.drop_constraint(fk_name, table_name, type_="foreignkey")
        if _column_exists(conn, table_name, "creator_id"):
            op.drop_column(table_name, "creator_id")
