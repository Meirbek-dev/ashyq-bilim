"""restore bulk timestamps to text for app compatibility

Revision ID: d1e2f3a4b5c7
Revises: c1d2e3f4a5b6
Create Date: 2026-03-10 13:30:00.000000

The bulk timestamp migration converted many legacy creation_date / update_date
columns to TIMESTAMP WITH TIME ZONE, but most of the current SQLModel/Pydantic
layer still treats those fields as strings. That causes validation failures when
ORM rows are materialized.

This follow-up migration restores those legacy columns to TEXT so the existing
application models continue to work. Purpose-built timestamp migrations such as
course/activity/submission-specific changes remain untouched.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d1e2f3a4b5c7"
down_revision: str | None = "c1d2e3f4a5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_BOTH_NOT_NULL: list[str] = [
    "user",
    "usergroup",
    "usergroupuser",
    "usergroupresource",
    "organization",
    "resourceauthor",
    "trail",
    "trailstep",
    "trailrun",
    "collection",
    "collectioncourse",
    "chapter",
    "coursechapter",
    "chapteractivity",
    "courseupdate",
    "certifications",
    "coursediscussion",
    "block",
    "assignmenttask",
    "assignmenttasksubmission",
    "assignmentusersubmission",
    "exam",
    "question",
    "examattempt",
    "quiz_attempt",
    "quiz_question_stat",
    "organizationconfig",
]

_BOTH_NULLABLE: list[str] = [
    "assignment",
]

_CREATION_ONLY_NOT_NULL: list[str] = [
    "discussionlike",
    "discussiondislike",
]


def _has_table(conn: sa.engine.Connection, table: str) -> bool:
    inspector = sa.inspect(conn)
    return inspector.has_table(table)


def _to_text_not_null(table: str, col: str) -> None:
    op.alter_column(
        table,
        col,
        existing_type=sa.TIMESTAMP(timezone=True),
        type_=sa.Text(),
        existing_nullable=False,
        nullable=False,
        postgresql_using=f"{col}::text",
    )


def _to_text_nullable(table: str, col: str) -> None:
    op.alter_column(
        table,
        col,
        existing_type=sa.TIMESTAMP(timezone=True),
        type_=sa.Text(),
        existing_nullable=True,
        nullable=True,
        postgresql_using=f"{col}::text",
    )


def _to_timestamptz_not_null(conn: sa.engine.Connection, table: str, col: str) -> None:
    conn.execute(
        sa.text(
            f'UPDATE "{table}" '
            f"SET {col} = to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') "
            f"WHERE {col} IS NULL OR {col} = ''"
        )
    )
    op.alter_column(
        table,
        col,
        existing_type=sa.Text(),
        type_=sa.TIMESTAMP(timezone=True),
        existing_nullable=False,
        nullable=False,
        server_default=sa.text("now()"),
        postgresql_using=f"{col}::timestamptz",
    )
    op.alter_column(table, col, server_default=None)


def _to_timestamptz_nullable(table: str, col: str) -> None:
    op.alter_column(
        table,
        col,
        existing_type=sa.Text(),
        type_=sa.TIMESTAMP(timezone=True),
        existing_nullable=True,
        nullable=True,
        postgresql_using=f"NULLIF({col}, '')::timestamptz",
    )


def upgrade() -> None:
    conn = op.get_bind()

    for table in _BOTH_NOT_NULL:
        if not _has_table(conn, table):
            continue
        _to_text_not_null(table, "creation_date")
        _to_text_not_null(table, "update_date")

    for table in _BOTH_NULLABLE:
        if not _has_table(conn, table):
            continue
        _to_text_nullable(table, "creation_date")
        _to_text_nullable(table, "update_date")

    for table in _CREATION_ONLY_NOT_NULL:
        if not _has_table(conn, table):
            continue
        _to_text_not_null(table, "creation_date")


def downgrade() -> None:
    conn = op.get_bind()

    for table in _BOTH_NOT_NULL:
        if not _has_table(conn, table):
            continue
        _to_timestamptz_not_null(conn, table, "creation_date")
        _to_timestamptz_not_null(conn, table, "update_date")

    for table in _BOTH_NULLABLE:
        if not _has_table(conn, table):
            continue
        _to_timestamptz_nullable(table, "creation_date")
        _to_timestamptz_nullable(table, "update_date")

    for table in _CREATION_ONLY_NOT_NULL:
        if not _has_table(conn, table):
            continue
        _to_timestamptz_not_null(conn, table, "creation_date")
