"""remove_invite_permissions_and_cleanup

Revision ID: c72beef2c40e
Revises: 867d4f10ccb0
Create Date: 2026-02-08 14:46:28.663679

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c72beef2c40e"
down_revision: str | None = "867d4f10ccb0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Remove invite-related permissions from role_permission table."""
    # Get connection
    conn = op.get_bind()

    # Check if role_permission table exists
    result = conn.execute(
        sa.text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = 'role_permission'
        );
    """)
    )
    table_exists = result.scalar()

    if not table_exists:
        print("role_permission table does not exist, skipping migration")
        return

    # Remove user:invite:org permission from role_permission associations
    print("Removing user:invite:org permissions from role_permission table...")

    result = conn.execute(
        sa.text("""
        DELETE FROM role_permission
        WHERE permission = 'user:invite:org'
    """)
    )

    deleted_count = result.rowcount
    print(f"Removed {deleted_count} user:invite:org permission entries")


def downgrade() -> None:
    """Restore invite permissions to admin role."""
    conn = op.get_bind()

    print("Restoring user:invite:org permission to admin role...")

    # Find admin role and add user:invite:org permission back
    # Note: This is a best-effort restore - only restores to system admin role
    conn.execute(
        sa.text("""
        INSERT INTO role_permission (role_id, permission)
        SELECT r.id, 'user:invite:org'
        FROM role r
        WHERE r.slug = 'admin'
        AND r.is_system = true
        AND NOT EXISTS (
            SELECT 1 FROM role_permission rp
            WHERE rp.role_id = r.id AND rp.permission = 'user:invite:org'
        )
    """)
    )

    print("user:invite:org permission restored to admin role")
