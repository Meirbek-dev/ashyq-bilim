"""remove_signup_mode_field_from_model

Revision ID: d88e6a4f9403
Revises: c72beef2c40e
Create Date: 2026-02-08 15:28:35.017497

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d88e6a4f9403"
down_revision: str | None = "c72beef2c40e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """
    Final cleanup: Ensure all signup_mode references are removed from organization configs.

    This migration completes the removal of organization invite/join mechanisms by:
    1. Ensuring any remaining signup_mode fields are removed from configs
    2. Documenting the removal of signup_mode from MemberOrgConfig model

    Note: The primary data cleanup was done in migration 867d4f10ccb0.
    This migration serves as final verification and documentation.
    """
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

    # Final cleanup: Remove any remaining signup_mode fields
    # This is defensive in case migration 867d4f10ccb0 was not run or incomplete
    print("Performing final cleanup of signup_mode from organization configs...")

    result = conn.execute(
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

    rows_updated = result.rowcount
    if rows_updated > 0:
        print(f"Cleaned up signup_mode from {rows_updated} organization configs")
    else:
        print("No signup_mode fields found - cleanup already complete")


def downgrade() -> None:
    """
    Restore signup_mode field with default 'open' value.

    Note: This is a best-effort restore. The actual signup mechanism
    has been removed from the codebase, so restoring this field
    will not restore functionality.
    """
    conn = op.get_bind()

    print("Restoring signup_mode to organization configs with default 'open' value...")

    conn.execute(
        sa.text("""
        UPDATE organization_config
        SET config = jsonb_set(
            config::jsonb,
            '{features,members,signup_mode}',
            '"open"'::jsonb
        )
        WHERE config::jsonb #> '{features,members}' IS NOT NULL
    """)
    )

    print("signup_mode field restored (data only - functionality not restored)")
