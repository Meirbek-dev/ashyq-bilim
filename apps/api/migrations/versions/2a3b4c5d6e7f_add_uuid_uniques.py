"""add_uuid_uniques

Revision ID: 2a3b4c5d6e7f
Revises: f1a2b3c4d5e6
Create Date: 2026-02-11 00:00:00.000000

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2a3b4c5d6e7f"
down_revision: str | None = "f1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Tables/columns to make unique (table, column, constraint_name, index_name)
TARGETS = [
    (
        "activity",
        "activity_uuid",
        "uq_activity_activity_uuid",
        "idx_activity_activity_uuid",
    ),
    ("course", "course_uuid", "uq_course_course_uuid", "idx_course_course_uuid"),
    (
        "collection",
        "collection_uuid",
        "uq_collection_collection_uuid",
        "idx_collection_collection_uuid",
    ),
    ("chapter", "chapter_uuid", "uq_chapter_chapter_uuid", "idx_chapter_chapter_uuid"),
    (
        "assignment",
        "assignment_uuid",
        "uq_assignment_assignment_uuid",
        "idx_assignment_assignment_uuid",
    ),
    (
        "assignmenttask",
        "assignment_task_uuid",
        "uq_assignmenttask_assignment_task_uuid",
        "idx_assignmenttask_assignment_task_uuid",
    ),
    (
        "assignmenttasksubmission",
        "assignment_task_submission_uuid",
        "uq_assignmenttasksubmission_assignment_task_submission_uuid",
        "idx_assignmenttasksubmission_assignment_task_submission_uuid",
    ),
    (
        "assignmentusersubmission",
        "assignmentusersubmission_uuid",
        "uq_assignmentusersubmission_assignmentusersubmission_uuid",
        "idx_assignmentusersubmission_assignmentusersubmission_uuid",
    ),
    ("block", "block_uuid", "uq_block_block_uuid", "idx_block_block_uuid"),
    (
        "collection",
        "collection_uuid",
        "uq_collection_collection_uuid",
        "idx_collection_collection_uuid",
    ),
    (
        "courseupdate",
        "courseupdate_uuid",
        "uq_courseupdate_courseupdate_uuid",
        "idx_courseupdate_courseupdate_uuid",
    ),
    (
        "certifications",
        "certification_uuid",
        "uq_certifications_certification_uuid",
        "idx_certifications_certification_uuid",
    ),
    (
        "certificateuser",
        "user_certification_uuid",
        "uq_certificateuser_user_certification_uuid",
        "idx_certificateuser_user_certification_uuid",
    ),
    (
        "usergroup",
        "usergroup_uuid",
        "uq_usergroup_usergroup_uuid",
        "idx_usergroup_usergroup_uuid",
    ),
]


def _check_duplicates(
    conn: sa.engine.Connection, table: str, column: str
) -> tuple[list, str | None]:
    """Return (duplicates_list, error_message).

    - If table does not exist, returns ([], None)
    - If query fails, returns ([], error_message) so caller can decide how to handle it
    """
    # Check table existence first
    try:
        exists = conn.execute(
            sa.text(
                "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = :t)"
            ),
            {"t": table},
        ).scalar()
    except Exception as e:  # pragma: no cover - defensive
        return ([], f"failed to check existence of table {table}: {e}")

    if not exists:
        # table not present in this DB state - skip gracefully
        return ([], None)

    try:
        stmt = sa.text(
            f"SELECT {column} as val, count(*) as c FROM {table} GROUP BY {column} HAVING count(*) > 1 LIMIT 10"
        )
        res = conn.execute(stmt).fetchall()
        return ([dict(r) for r in res], None)
    except Exception as e:
        # Query failed - surface an error message instead of letting DB abort the transaction
        return ([], f"failed to query duplicates for {table}.{column}: {e}")


def _table_exists(conn: sa.engine.Connection, table: str) -> bool:
    return bool(
        conn.execute(
            sa.text(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = :table
                )
                """
            ),
            {"table": table},
        ).scalar()
    )


def _column_exists(conn: sa.engine.Connection, table: str, column: str) -> bool:
    return bool(
        conn.execute(
            sa.text(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = :table
                      AND column_name = :column
                )
                """
            ),
            {"table": table, "column": column},
        ).scalar()
    )


def _constraint_exists(conn: sa.engine.Connection, table: str, constraint: str) -> bool:
    return bool(
        conn.execute(
            sa.text(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM pg_constraint c
                    JOIN pg_class t ON t.oid = c.conrelid
                    JOIN pg_namespace n ON n.oid = t.relnamespace
                    WHERE n.nspname = 'public'
                      AND t.relname = :table
                      AND c.conname = :constraint
                )
                """
            ),
            {"table": table, "constraint": constraint},
        ).scalar()
    )


def upgrade() -> None:
    conn = op.get_bind()

    # Pre-check for duplicates before attempting to add unique constraints
    duplicates: dict = {}
    errors: dict = {}

    for table, column, _, _ in TARGETS:
        dups, err = _check_duplicates(conn, table, column)
        if err:
            errors[f"{table}.{column}"] = err
            continue
        if dups:
            duplicates[f"{table}.{column}"] = dups

    if errors:
        raise RuntimeError(
            "Cannot add UNIQUE constraints because errors occurred during pre-check: "
            + "; ".join(f"{k}:{v}" for k, v in errors.items())
        )

    if duplicates:
        # Present a helpful message and abort migration so the operator can fix duplicates first
        raise RuntimeError(
            "Cannot add UNIQUE constraints because duplicates were found: "
            + "; ".join(f"{k}:{v}" for k, v in duplicates.items())
        )

    # No duplicates - create constraints and indexes
    for table, column, constraint_name, index_name in TARGETS:
        if not _table_exists(conn, table) or not _column_exists(conn, table, column):
            continue

        if not _constraint_exists(conn, table, constraint_name):
            op.create_unique_constraint(constraint_name, table, [column])

        conn.execute(
            sa.text(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table} ({column})")
        )


def downgrade() -> None:
    conn = op.get_bind()

    # Remove constraints and indexes added by this revision
    for table, _column, constraint_name, index_name in TARGETS:
        if _table_exists(conn, table):
            conn.execute(sa.text(f"DROP INDEX IF EXISTS {index_name}"))
            conn.execute(
                sa.text(
                    f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint_name}"
                )
            )
