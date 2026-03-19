"""remove invite permission from rbac

Revision ID: 9daecf9a5854
Revises: 269b56eec536
Create Date: 2026-02-21 15:14:48.714795

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9daecf9a5854"
down_revision: str | None = "269b56eec536"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Remove deprecated invite permission from RBAC permission tables."""
    conn = op.get_bind()

    conn.execute(
        sa.text(
            """
            DELETE FROM role_permissions
            WHERE permission_id IN (
                SELECT id
                FROM permissions
                WHERE name = 'user:invite:org'
            )
            """
        )
    )

    conn.execute(
        sa.text(
            """
            DELETE FROM permissions
            WHERE name = 'user:invite:org'
            """
        )
    )


def downgrade() -> None:
    """Restore invite permission and assign it to system admin role."""
    conn = op.get_bind()

    conn.execute(
        sa.text(
            """
            INSERT INTO permissions (name, resource_type, action, scope, description)
            SELECT
                'user:invite:org',
                'user',
                'invite',
                'org',
                'Invite users to organization'
            WHERE NOT EXISTS (
                SELECT 1 FROM permissions WHERE name = 'user:invite:org'
            )
            """
        )
    )

    conn.execute(
        sa.text(
            """
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT r.id, p.id
            FROM roles r
            JOIN permissions p ON p.name = 'user:invite:org'
                        WHERE r.slug = 'admin'
              AND r.is_system = true
              AND r.org_id IS NULL
              AND NOT EXISTS (
                  SELECT 1
                  FROM role_permissions rp
                  WHERE rp.role_id = r.id
                    AND rp.permission_id = p.id
              )
            """
        )
    )
