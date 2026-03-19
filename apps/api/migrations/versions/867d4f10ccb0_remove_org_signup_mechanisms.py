"""remove_org_signup_mechanisms

Revision ID: 867d4f10ccb0
Revises: c6ac02f61616
Create Date: 2026-02-08 14:05:23.278073

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "867d4f10ccb0"
down_revision: str | None = "c6ac02f61616"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Remove signup_mode from organization configs."""
    # Get connection
    conn = op.get_bind()

    # Check if organization_config table exists
    result = conn.execute(
        sa.text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = 'organization_config'
        );
    """)
    )
    table_exists = result.scalar()

    if not table_exists:
        print("organization_config table does not exist, skipping migration")
        return

    # Update all organization configs to remove signup_mode from members feature
    # This is a data migration - we're updating JSON structures
    print("Removing signup_mode from organization configs...")

    # SQL to update JSON in PostgreSQL
    conn.execute(
        sa.text("""
        UPDATE organization_config
        SET config = jsonb_set(
            config::jsonb,
            '{features,members}',
            (config::jsonb #> '{features,members}') - 'signup_mode'
        )
        WHERE config::jsonb #> '{features,members,signup_mode}' IS NOT NULL
    """)
    )

    print("signup_mode removed from organization configs")

    # Note: Invite codes are stored in Redis, not the database
    # They will expire naturally or can be cleared manually from Redis
    print("Note: Invite codes in Redis will expire naturally")


def downgrade() -> None:
    """Restore signup_mode to organization configs."""
    conn = op.get_bind()

    print("Restoring signup_mode to organization configs...")

    # Add signup_mode back with default value 'open'
    conn.execute(
        sa.text("""
        UPDATE organization_config
        SET config = jsonb_set(
            config::jsonb,
            '{features,members,signup_mode}',
            '"open"'::jsonb
        )
    """)
    )

    print("signup_mode restored to organization configs")
