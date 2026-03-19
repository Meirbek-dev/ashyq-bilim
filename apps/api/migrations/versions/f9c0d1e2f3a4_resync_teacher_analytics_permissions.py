"""resync teacher analytics permissions

Revision ID: f9c0d1e2f3a4
Revises: f8b9c0d1e2f3
Create Date: 2026-03-08 10:30:00.000000
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

revision: str = "f9c0d1e2f3a4"
down_revision: str | None = "f8b9c0d1e2f3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _ensure_permission(conn, name: str) -> None:
    resource, action, scope = name.split(":")
    conn.execute(
        text(
            """
            INSERT INTO permissions (name, resource_type, action, scope, created_at)
            VALUES (:name, :resource_type, :action, :scope, NOW())
            ON CONFLICT (name) DO NOTHING
            """
        ),
        {"name": name, "resource_type": resource, "action": action, "scope": scope},
    )


def _assign_permission_to_role(conn, role_slug: str, permission_name: str) -> None:
    conn.execute(
        text(
            """
            INSERT INTO role_permissions (role_id, permission_id, granted_at)
            SELECT r.id, p.id, NOW()
            FROM roles r
            JOIN permissions p ON p.name = :permission_name
            WHERE r.slug = :role_slug AND r.org_id IS NULL
            ON CONFLICT DO NOTHING
            """
        ),
        {"role_slug": role_slug, "permission_name": permission_name},
    )


def upgrade() -> None:
    conn = op.get_bind()

    for permission_name in [
        "analytics:read:assigned",
        "analytics:export:assigned",
        "analytics:read:org",
    ]:
        _ensure_permission(conn, permission_name)

    conn.execute(
        text(
            """
            DELETE FROM role_permissions rp
            USING roles r, permissions p
            WHERE rp.role_id = r.id
              AND rp.permission_id = p.id
              AND r.org_id IS NULL
              AND p.name = 'analytics:read:own'
              AND r.slug IN ('instructor', 'maintainer')
            """
        )
    )

    _assign_permission_to_role(conn, "instructor", "analytics:read:assigned")
    _assign_permission_to_role(conn, "instructor", "analytics:export:assigned")
    _assign_permission_to_role(conn, "maintainer", "analytics:read:org")


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        text(
            """
            DELETE FROM role_permissions rp
            USING roles r, permissions p
            WHERE rp.role_id = r.id
              AND rp.permission_id = p.id
              AND r.org_id IS NULL
              AND (
                (r.slug = 'instructor' AND p.name IN ('analytics:read:assigned', 'analytics:export:assigned'))
                OR (r.slug = 'maintainer' AND p.name = 'analytics:read:org')
              )
            """
        )
    )
    _ensure_permission(conn, "analytics:read:own")
    _assign_permission_to_role(conn, "instructor", "analytics:read:own")
    _assign_permission_to_role(conn, "maintainer", "analytics:read:own")
