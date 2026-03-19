"""Dedupe user_roles and add unique constraint

Revision ID: b3f9d2c4a7e8
Revises: 69fd16a5d534
Create Date: 2026-01-31 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = "b3f9d2c4a7e8"
down_revision = "69fd16a5d534"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Remove exact duplicate role assignments safely and add unique
    (user_id, org_id) constraint only when data is compatible.

    This migration must not collapse legitimate multi-role assignments.
    """
    conn = op.get_bind()

    table_exists = conn.execute(
        text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'user_roles'
            )
            """
        )
    ).scalar()
    if not table_exists:
        print("[Migration] user_roles table does not exist, skipping")
        return

    print("[Migration] Checking for duplicate user_roles (user_id, org_id)...")

    # Only detect exact duplicates of the same role assignment.
    dup_rows = conn.execute(
        text("""
            SELECT user_id, org_id, role_id, COUNT(*) as cnt
            FROM user_roles
            GROUP BY user_id, org_id, role_id
            HAVING COUNT(*) > 1
        """)
    ).fetchall()

    if not dup_rows:
        print("[Migration] No duplicate user_roles found")
    else:
        print(f"[Migration] Found {len(dup_rows)} duplicated (user_id, org_id) groups")

        # Delete only exact duplicate assignments, keeping the earliest granted_at.
        conn.execute(
            text("""
                WITH ranked AS (
                    SELECT ctid,
                           ROW_NUMBER() OVER (
                               PARTITION BY user_id, org_id, role_id
                               ORDER BY granted_at ASC NULLS FIRST
                           ) AS rn
                    FROM user_roles
                )
                DELETE FROM user_roles
                WHERE ctid IN (SELECT ctid FROM ranked WHERE rn > 1)
            """)
        )

        print("[Migration] Removed duplicate user_roles rows")

    # If users have multiple distinct roles in same org, do not enforce
    # one-role-per-org constraint.
    multi_role_groups = conn.execute(
        text(
            """
            SELECT user_id, org_id, COUNT(DISTINCT role_id) AS role_cnt
            FROM user_roles
            GROUP BY user_id, org_id
            HAVING COUNT(DISTINCT role_id) > 1
            LIMIT 5
            """
        )
    ).fetchall()

    if multi_role_groups:
        print(
            "[Migration] Detected multi-role assignments per (user_id, org_id); "
            "skipping uq_user_roles_user_org creation to preserve role data"
        )
        return

    # Add unique constraint only if safe.
    try:
        conn.execute(
            text(
                "ALTER TABLE user_roles ADD CONSTRAINT uq_user_roles_user_org UNIQUE (user_id, org_id)"
            )
        )
        print("[Migration] Added unique constraint uq_user_roles_user_org")
    except Exception as e:
        print(f"[Migration] Warning: could not add unique constraint: {e}")


def downgrade() -> None:
    """Remove unique constraint (cannot restore deleted duplicate rows)."""
    conn = op.get_bind()
    try:
        conn.execute(
            text(
                "ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS uq_user_roles_user_org"
            )
        )
        print("[Migration] Dropped unique constraint uq_user_roles_user_org")
    except Exception as e:
        print(f"[Migration] Warning: could not drop unique constraint: {e}")
