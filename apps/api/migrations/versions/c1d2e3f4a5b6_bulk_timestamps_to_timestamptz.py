"""bulk_timestamps_to_timestamptz

Convert all remaining creation_date / update_date TEXT columns to
TIMESTAMP WITH TIME ZONE, completing the work started by the earlier
course (7f8g9h0i1j2k) and activity (5d6e7f8g9h0i) migrations.

Empty strings and NULL values in non-nullable columns are filled with
NOW() so the NOT NULL constraint is satisfied for every row.

Revision ID: c1d2e3f4a5b6
Revises: b2c3d4e5f6a7
Create Date: 2026-03-10 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c1d2e3f4a5b6"
down_revision: str | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# ── Tables that get TIMESTAMPTZ NOT NULL DEFAULT now() ────────────────────────
# Each entry migrates both creation_date and update_date.
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

# Tables where creation_date / update_date may be NULL in the application model.
_BOTH_NULLABLE: list[str] = [
    "assignment",
]

# Tables that only have creation_date (no update_date), NOT NULL.
_CREATION_ONLY_NOT_NULL: list[str] = [
    "discussionlike",
    "discussiondislike",
]


# ── Helpers ───────────────────────────────────────────────────────────────────


def _to_not_null_timestamptz(conn: sa.engine.Connection, table: str, col: str) -> None:
    """Convert a TEXT column to TIMESTAMPTZ NOT NULL, filling dead rows with NOW()."""
    # Replace empty strings and NULLs with a parseable ISO-8601 sentinel so the
    # subsequent NOT NULL constraint cannot fail.
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
        existing_nullable=True,
        nullable=False,
        server_default=sa.text("now()"),
        postgresql_using=f"{col}::timestamptz",
    )
    # Drop the server default — application code is responsible for setting the value.
    # Keeping a server default here would silently swallow missing application writes.
    op.alter_column(table, col, server_default=None)


def _to_nullable_timestamptz(table: str, col: str) -> None:
    """Convert a TEXT column to TIMESTAMPTZ NULL; empty strings become NULL."""
    op.alter_column(
        table,
        col,
        existing_type=sa.Text(),
        type_=sa.TIMESTAMP(timezone=True),
        existing_nullable=True,
        nullable=True,
        postgresql_using=f"NULLIF({col}, '')::timestamptz",
    )


# ── Upgrade ───────────────────────────────────────────────────────────────────


def upgrade() -> None:
    conn = op.get_bind()

    for table in _BOTH_NOT_NULL:
        _to_not_null_timestamptz(conn, table, "creation_date")
        _to_not_null_timestamptz(conn, table, "update_date")

    for table in _BOTH_NULLABLE:
        _to_nullable_timestamptz(table, "creation_date")
        _to_nullable_timestamptz(table, "update_date")

    for table in _CREATION_ONLY_NOT_NULL:
        _to_not_null_timestamptz(conn, table, "creation_date")


# ── Downgrade ─────────────────────────────────────────────────────────────────


def downgrade() -> None:
    def _revert_not_null(table: str, col: str) -> None:
        op.alter_column(
            table,
            col,
            existing_type=sa.TIMESTAMP(timezone=True),
            type_=sa.Text(),
            existing_nullable=False,
            nullable=True,
            postgresql_using=f"{col}::text",
        )

    def _revert_nullable(table: str, col: str) -> None:
        op.alter_column(
            table,
            col,
            existing_type=sa.TIMESTAMP(timezone=True),
            type_=sa.Text(),
            existing_nullable=True,
            nullable=True,
            postgresql_using=f"{col}::text",
        )

    for table in reversed(_BOTH_NOT_NULL):
        _revert_not_null(table, "creation_date")
        _revert_not_null(table, "update_date")

    for table in _BOTH_NULLABLE:
        _revert_nullable(table, "creation_date")
        _revert_nullable(table, "update_date")

    for table in _CREATION_ONLY_NOT_NULL:
        _revert_not_null(table, "creation_date")
