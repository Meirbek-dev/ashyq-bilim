"""merge heads and add missing creator_id columns

Revision ID: f2a3b4c5d6e7
Revises: a1bc2d3e4f5g, e3f4a5b6c7d8
Create Date: 2026-02-24 00:00:00.000000

Merges the two diverged heads and ensures creator_id exists on all tables
that require it. The base migration (69fd16a5d534) swallowed exceptions
silently, so the column may not have been added.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "f2a3b4c5d6e7"
down_revision: tuple[str, str] = ("a1bc2d3e4f5g", "e3f4a5b6c7d8")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = [
    ("organization", "fk_organization_creator_id_user"),
    ("course", "fk_course_creator_id_user"),
    ("activity", "fk_activity_creator_id_user"),
    ("collection", "fk_collection_creator_id_user"),
    ("usergroup", "fk_usergroup_creator_id_user"),
]


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    result = conn.execute(
        text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table_name, "c": column_name},
    )
    return result.fetchone() is not None


def _fk_exists(conn, constraint_name: str) -> bool:
    result = conn.execute(
        text(
            "SELECT constraint_name FROM information_schema.table_constraints "
            "WHERE constraint_type = 'FOREIGN KEY' AND constraint_name = :n"
        ),
        {"n": constraint_name},
    )
    return result.fetchone() is not None


def upgrade() -> None:
    conn = op.get_bind()

    for table_name, fk_name in TABLES:
        if not _column_exists(conn, table_name, "creator_id"):
            op.add_column(
                table_name,
                sa.Column("creator_id", sa.BigInteger(), nullable=True),
            )

        if not _fk_exists(conn, fk_name):
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
        if _fk_exists(conn, fk_name):
            op.drop_constraint(fk_name, table_name, type_="foreignkey")
        if _column_exists(conn, table_name, "creator_id"):
            op.drop_column(table_name, "creator_id")
