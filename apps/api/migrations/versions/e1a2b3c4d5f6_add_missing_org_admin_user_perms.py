"""Ensure user management permissions exist

Revision ID: e1a2b3c4d5f6
Revises: d8f9a1e3b5f9
Create Date: 2026-02-10 12:00:00.000000

Add user:create:org and user:delete:org permissions if missing.
"""

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = "e1a2b3c4d5f6"
down_revision = "d8f9a1e3b5f9"
branch_labels = None
depends_on = None

NEW_PERMISSIONS = [
    "user:create:org",
    "user:delete:org",
]


def upgrade() -> None:
    conn = op.get_bind()

    for perm_name in NEW_PERMISSIONS:
        resource, action, scope = perm_name.split(":")

        # Upsert permission row
        perm_row = conn.execute(
            text("SELECT id FROM permissions WHERE name = :name"),
            {"name": perm_name},
        ).fetchone()
        if perm_row is None:
            conn.execute(
                text(
                    "INSERT INTO permissions (name, resource_type, action, scope, created_at) "
                    "VALUES (:name, :resource, :action, :scope, NOW())"
                ),
                {
                    "name": perm_name,
                    "resource": resource,
                    "action": action,
                    "scope": scope,
                },
            )
            perm_row = conn.execute(
                text("SELECT id FROM permissions WHERE name = :name"),
                {"name": perm_name},
            ).fetchone()


def downgrade() -> None:
    conn = op.get_bind()

    for perm_name in NEW_PERMISSIONS:
        perm_row = conn.execute(
            text("SELECT id FROM permissions WHERE name = :name"),
            {"name": perm_name},
        ).fetchone()
        if perm_row is None:
            continue
        perm_id = perm_row[0]

        # Remove permission if no longer referenced by any role
        conn.execute(
            text(
                "DELETE FROM permissions WHERE id = :perm_id "
                "AND NOT EXISTS ("
                "  SELECT 1 FROM role_permissions WHERE permission_id = :perm_id"
                ")"
            ),
            {"perm_id": perm_id},
        )
