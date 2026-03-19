"""Rename super-admin role slug to admin.

Revision ID: 2d4e6f8a9b0c
Revises: 1f9b2c3d4e5f
Create Date: 2026-02-25 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2d4e6f8a9b0c"
down_revision: str | None = "1f9b2c3d4e5f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _table_exists(conn, table_name: str) -> bool:
    row = conn.execute(
        sa.text(
            """
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = :table_name
            """
        ),
        {"table_name": table_name},
    ).fetchone()
    return row is not None


def _merge_role(conn, old_role_id: int, new_role_id: int) -> None:
    if _table_exists(conn, "user_roles"):
        conn.execute(
            sa.text(
                """
                INSERT INTO user_roles (user_id, role_id, org_id, assigned_at, assigned_by)
                SELECT ur.user_id, :new_role_id, ur.org_id, ur.assigned_at, ur.assigned_by
                FROM user_roles ur
                WHERE ur.role_id = :old_role_id
                  AND NOT EXISTS (
                      SELECT 1
                      FROM user_roles x
                      WHERE x.user_id = ur.user_id
                        AND x.org_id IS NOT DISTINCT FROM ur.org_id
                        AND x.role_id = :new_role_id
                  )
                """
            ),
            {"old_role_id": old_role_id, "new_role_id": new_role_id},
        )
        conn.execute(
            sa.text("DELETE FROM user_roles WHERE role_id = :old_role_id"),
            {"old_role_id": old_role_id},
        )

    if _table_exists(conn, "role_permissions"):
        conn.execute(
            sa.text(
                """
                INSERT INTO role_permissions (role_id, permission_id)
                SELECT :new_role_id, rp.permission_id
                FROM role_permissions rp
                WHERE rp.role_id = :old_role_id
                  AND NOT EXISTS (
                      SELECT 1
                      FROM role_permissions x
                      WHERE x.role_id = :new_role_id
                        AND x.permission_id = rp.permission_id
                  )
                """
            ),
            {"old_role_id": old_role_id, "new_role_id": new_role_id},
        )
        conn.execute(
            sa.text("DELETE FROM role_permissions WHERE role_id = :old_role_id"),
            {"old_role_id": old_role_id},
        )

    conn.execute(
        sa.text("DELETE FROM roles WHERE id = :old_role_id"),
        {"old_role_id": old_role_id},
    )


def _rename_slug(conn, old_slug: str, new_slug: str) -> None:
    if not _table_exists(conn, "roles"):
        return

    rows = conn.execute(
        sa.text("SELECT id, org_id FROM roles WHERE slug = :old_slug"),
        {"old_slug": old_slug},
    ).fetchall()

    for role_id, org_id in rows:
        existing_new = conn.execute(
            sa.text(
                """
                SELECT id
                FROM roles
                WHERE slug = :new_slug
                  AND org_id IS NOT DISTINCT FROM :org_id
                  AND id <> :role_id
                LIMIT 1
                """
            ),
            {"new_slug": new_slug, "org_id": org_id, "role_id": role_id},
        ).fetchone()

        if existing_new:
            _merge_role(conn, role_id, existing_new[0])
        else:
            conn.execute(
                sa.text("UPDATE roles SET slug = :new_slug WHERE id = :role_id"),
                {"new_slug": new_slug, "role_id": role_id},
            )


def upgrade() -> None:
    conn = op.get_bind()
    _rename_slug(conn, "super-admin", "admin")


def downgrade() -> None:
    conn = op.get_bind()
    _rename_slug(conn, "admin", "super-admin")
