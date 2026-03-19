"""Update organization permission scopes from :own to :org

Revision ID: d8f9a1e3b5f9
Revises: c4a1e8f73b92
Create Date: 2026-02-10 03:56:00.000000

Change organization permissions from :own to :org scope and reassign
existing role_permissions rows accordingly.
"""

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = "d8f9a1e3b5f9"
down_revision = "c4a1e8f73b92"
branch_labels = None
depends_on = None

# Mapping old permission -> new permission
MAPPINGS = {
    "organization:manage:own": "organization:manage:org",
    "organization:update:own": "organization:update:org",
    "organization:read:own": "organization:read:org",
}


def upgrade() -> None:
    conn = op.get_bind()
    for old_name, new_name in MAPPINGS.items():
        # Ensure new permission exists
        new_id_row = conn.execute(
            text("SELECT id FROM permissions WHERE name = :name"),
            {"name": new_name},
        ).fetchone()
        if new_id_row is None:
            # Parse resource, action, scope
            parts = new_name.split(":")
            resource, action, scope = parts
            conn.execute(
                text(
                    "INSERT INTO permissions (name, resource_type, action, scope, created_at) "
                    "VALUES (:name, :resource, :action, :scope, NOW())"
                ),
                {
                    "name": new_name,
                    "resource": resource,
                    "action": action,
                    "scope": scope,
                },
            )
            new_id_row = conn.execute(
                text("SELECT id FROM permissions WHERE name = :name"),
                {"name": new_name},
            ).fetchone()

        new_id = new_id_row[0]

        # Find old permission id
        old_id_row = conn.execute(
            text("SELECT id FROM permissions WHERE name = :name"),
            {"name": old_name},
        ).fetchone()
        if old_id_row is None:
            # Nothing to rewrite
            continue
        old_id = old_id_row[0]

        # Re-point role_permissions
        conn.execute(
            text(
                "UPDATE role_permissions SET permission_id = :new_id WHERE permission_id = :old_id"
            ),
            {"new_id": new_id, "old_id": old_id},
        )

        # If old permission is no longer referenced, delete it
        conn.execute(
            text(
                "DELETE FROM permissions WHERE id = :old_id AND NOT EXISTS (SELECT 1 FROM role_permissions WHERE permission_id = :old_id)"
            ),
            {"old_id": old_id},
        )


def downgrade() -> None:
    conn = op.get_bind()
    # Reverse mappings
    for old_name, new_name in MAPPINGS.items():
        # Ensure old permission exists
        old_id_row = conn.execute(
            text("SELECT id FROM permissions WHERE name = :name"),
            {"name": old_name},
        ).fetchone()
        if old_id_row is None:
            parts = old_name.split(":")
            resource, action, scope = parts
            conn.execute(
                text(
                    "INSERT INTO permissions (name, resource_type, action, scope, created_at) "
                    "VALUES (:name, :resource, :action, :scope, NOW())"
                ),
                {
                    "name": old_name,
                    "resource": resource,
                    "action": action,
                    "scope": scope,
                },
            )
            old_id_row = conn.execute(
                text("SELECT id FROM permissions WHERE name = :name"),
                {"name": old_name},
            ).fetchone()

        old_id = old_id_row[0]

        # Find new permission id
        new_id_row = conn.execute(
            text("SELECT id FROM permissions WHERE name = :name"),
            {"name": new_name},
        ).fetchone()
        if new_id_row is None:
            continue
        new_id = new_id_row[0]

        # Re-point role_permissions back
        conn.execute(
            text(
                "UPDATE role_permissions SET permission_id = :old_id WHERE permission_id = :new_id"
            ),
            {"old_id": old_id, "new_id": new_id},
        )

        # If new permission is no longer referenced, delete it
        conn.execute(
            text(
                "DELETE FROM permissions WHERE id = :new_id AND NOT EXISTS (SELECT 1 FROM role_permissions WHERE permission_id = :new_id)"
            ),
            {"new_id": new_id},
        )
