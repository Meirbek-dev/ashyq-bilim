"""purge multiorg schema columns

Revision ID: 37881a918cc1
Revises: d1e2f3a4b5c7
Create Date: 2026-03-17 14:19:44.324759

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "37881a918cc1"
down_revision: str | None = "d1e2f3a4b5c7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


PRIMARY_KEY_REBUILDS: dict[str, list[str]] = {
    "daily_teacher_metrics": ["metric_date", "teacher_user_id"],
    "daily_course_metrics": ["metric_date", "course_id"],
    "daily_user_course_progress": ["metric_date", "user_id", "course_id"],
    "learner_risk_snapshot": ["snapshot_date", "user_id", "course_id"],
}

DROP_COLUMN_TABLES: dict[str, list[str]] = {
    "analytics_event": ["org_id"],
    "daily_course_engagement": ["org_id"],
    "daily_assessment_metrics": ["org_id"],
    "roles": ["org_id"],
    "user_roles": ["org_id"],
    "gamification_profiles": ["org_id"],
    "xp_transactions": ["org_id"],
    "org_gamification_config": ["org_id"],
    "collection": ["org_id"],
    "collectioncourse": ["org_id"],
    "usergroup": ["org_id"],
    "usergroupresource": ["org_id"],
    "usergroupuser": ["org_id"],
    "trail": ["org_id"],
    "trailrun": ["org_id"],
    "trailstep": ["org_id"],
    "course": ["org_id"],
    "chapter": ["org_id"],
    "activity": ["org_id"],
    "block": ["org_id"],
    "assignment": ["org_id"],
    "assignmenttask": ["org_id"],
    "courseupdate": ["org_id"],
    "chapteractivity": ["org_id"],
    "coursechapter": ["org_id"],
    "coursediscussion": ["org_id"],
    "exam": ["org_id"],
    "question": ["org_id"],
    "examattempt": ["org_id"],
    "codesubmission": ["org_id"],
    "hintusage": ["org_id"],
    "paymentsconfig": ["org_id"],
    "paymentscourse": ["org_id"],
    "paymentsproduct": ["org_id"],
    "paymentsuser": ["org_id"],
}

UNIQUE_CONSTRAINTS_TO_CREATE: list[tuple[str, str, list[str]]] = [
    ("roles", "uq_roles_slug", ["slug"]),
    ("user_roles", "uq_user_roles_user_role", ["user_id", "role_id"]),
    ("gamification_profiles", "uq_gamification_profile_user", ["user_id"]),
    (
        "xp_transactions",
        "uq_xp_tx_user_source_once",
        ["user_id", "source", "source_id"],
    ),
]

INDEXES_TO_CREATE: list[tuple[str, str, list[str], bool]] = [
    ("user_roles", "idx_user_roles_user_role", ["user_id", "role_id"], False),
    ("gamification_profiles", "idx_profile_total_xp", ["total_xp"], False),
    ("xp_transactions", "idx_transaction_user", ["user_id"], False),
]


def _table_exists(conn, table: str) -> bool:
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


def _column_exists(conn, table: str, column: str) -> bool:
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


def _constraint_exists(conn, table: str, constraint: str) -> bool:
    return bool(
        conn.execute(
            sa.text(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.table_constraints
                    WHERE table_schema = 'public'
                      AND table_name = :table
                      AND constraint_name = :constraint
                )
                """
            ),
            {"table": table, "constraint": constraint},
        ).scalar()
    )


def _constraint_rows_for_column(conn, table: str, column: str) -> list[tuple[str, str]]:
    rows = conn.execute(
        sa.text(
            """
            SELECT DISTINCT tc.constraint_name, tc.constraint_type
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_schema = kcu.constraint_schema
             AND tc.constraint_name = kcu.constraint_name
             AND tc.table_name = kcu.table_name
            WHERE tc.table_schema = 'public'
              AND tc.table_name = :table
              AND kcu.column_name = :column
            """
        ),
        {"table": table, "column": column},
    ).fetchall()
    return [(row[0], row[1]) for row in rows]


def _indexes_for_column(conn, table: str, column: str) -> list[str]:
    rows = conn.execute(
        sa.text(
            """
            SELECT DISTINCT i.relname AS index_name
            FROM pg_class t
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_index ix ON ix.indrelid = t.oid
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_attribute a
              ON a.attrelid = t.oid
             AND a.attnum = ANY(ix.indkey)
            WHERE n.nspname = 'public'
              AND t.relname = :table
              AND a.attname = :column
              AND NOT ix.indisprimary
            """
        ),
        {"table": table, "column": column},
    ).fetchall()
    return [row[0] for row in rows]


def _drop_column_dependencies(conn, table: str, column: str) -> None:
    constraint_type_map = {
        "FOREIGN KEY": "foreignkey",
        "UNIQUE": "unique",
        "PRIMARY KEY": "primary",
    }
    for name, constraint_type in _constraint_rows_for_column(conn, table, column):
        mapped = constraint_type_map.get(constraint_type)
        if mapped is not None:
            op.drop_constraint(name, table, type_=mapped)

    for index_name in _indexes_for_column(conn, table, column):
        op.execute(sa.text(f'DROP INDEX IF EXISTS "{index_name}"'))


def _dedup_gamification_profiles(conn) -> None:
    """Keep the row with the highest total_xp per user; delete the rest."""
    if not _table_exists(conn, "gamification_profiles"):
        return
    conn.execute(
        sa.text(
            """
            DELETE FROM gamification_profiles
            WHERE id NOT IN (
                SELECT DISTINCT ON (user_id) id
                FROM gamification_profiles
                ORDER BY user_id, total_xp DESC, id DESC
            )
            """
        )
    )


def _create_unique_if_missing(
    conn, table: str, constraint: str, columns: list[str]
) -> None:
    if _table_exists(conn, table) and not _constraint_exists(conn, table, constraint):
        op.create_unique_constraint(constraint, table, columns)


def _create_index_if_missing(
    conn, table: str, index_name: str, columns: list[str], unique: bool = False
) -> None:
    if not _table_exists(conn, table):
        return
    op.execute(
        sa.text(
            f'CREATE {"UNIQUE " if unique else ""}INDEX IF NOT EXISTS "{index_name}" '
            f'ON "{table}" ({", ".join(f'"{column}"' for column in columns)})'
        )
    )


def _rebuild_primary_key_without_column(
    conn, table: str, column: str, new_columns: list[str]
) -> None:
    if not _table_exists(conn, table) or not _column_exists(conn, table, column):
        return

    _drop_column_dependencies(conn, table, column)
    op.drop_column(table, column)

    if not _constraint_exists(conn, table, f"{table}_pkey"):
        op.create_primary_key(f"{table}_pkey", table, new_columns)


def _drop_column_if_present(conn, table: str, column: str) -> None:
    if not _table_exists(conn, table) or not _column_exists(conn, table, column):
        return
    _drop_column_dependencies(conn, table, column)
    op.drop_column(table, column)


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()

    for table, new_pk_columns in PRIMARY_KEY_REBUILDS.items():
        _rebuild_primary_key_without_column(conn, table, "org_id", new_pk_columns)

    for table, columns in DROP_COLUMN_TABLES.items():
        for column in columns:
            _drop_column_if_present(conn, table, column)

    _dedup_gamification_profiles(conn)

    for table, constraint, columns in UNIQUE_CONSTRAINTS_TO_CREATE:
        _create_unique_if_missing(conn, table, constraint, columns)

    for table, index_name, columns, unique in INDEXES_TO_CREATE:
        _create_index_if_missing(conn, table, index_name, columns, unique)


def downgrade() -> None:
    """Downgrade schema."""
    raise NotImplementedError(
        "Downgrade is not supported for the destructive multiorg schema purge."
    )
