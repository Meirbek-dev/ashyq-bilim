"""chapter_creator_id_and_userrole_org_nullable

Revision ID: 30d136b8fc44
Revises: 5447127d3297
Create Date: 2026-02-22 12:55:05.338583

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "30d136b8fc44"
down_revision: str | None = "5447127d3297"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # --- chapter: add creator_id ---
    op.execute("ALTER TABLE chapter ADD COLUMN IF NOT EXISTS creator_id INTEGER")
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.table_constraints
                WHERE constraint_schema = 'public'
                  AND table_name = 'chapter'
                  AND constraint_name = 'chapter_creator_id_fkey'
            ) THEN
                ALTER TABLE chapter
                ADD CONSTRAINT chapter_creator_id_fkey
                FOREIGN KEY (creator_id) REFERENCES "user"(id) ON DELETE SET NULL;
            END IF;
        END $$;
        """
    )

    # --- user_roles: replace composite PK with a surrogate id ---
    # PostgreSQL does not allow NULL values in primary key columns, so we
    # cannot simply ALTER org_id to be nullable while it is part of the PK.
    # Solution: drop the composite PK, add a serial surrogate PK, make
    # org_id nullable, and enforce uniqueness via partial indexes.

    # 1. Drop the existing composite primary key
    op.execute("ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_pkey")

    # 2. Add a new serial id column
    op.execute("ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS id SERIAL")

    # 3. Make org_id nullable (now safe since it is no longer part of the PK)
    op.execute("ALTER TABLE user_roles ALTER COLUMN org_id DROP NOT NULL")

    # 4. Set the new id column as the primary key
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.table_constraints
                WHERE constraint_schema = 'public'
                  AND table_name = 'user_roles'
                  AND constraint_name = 'user_roles_pkey'
            ) THEN
                ALTER TABLE user_roles ADD PRIMARY KEY (id);
            END IF;
        END $$;
        """
    )

    # 5. Enforce uniqueness for (user_id, role_id, org_id) — two partial indexes
    #    handle NULL and non-NULL org_id separately (compatible with PG 13+).
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS user_roles_unique_with_org "
        "ON user_roles (user_id, role_id, org_id) "
        "WHERE org_id IS NOT NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS user_roles_unique_no_org "
        "ON user_roles (user_id, role_id) "
        "WHERE org_id IS NULL"
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Drop unique indexes
    op.execute("DROP INDEX IF EXISTS user_roles_unique_with_org")
    op.execute("DROP INDEX IF EXISTS user_roles_unique_no_org")

    # Drop surrogate PK and id column
    op.execute("ALTER TABLE user_roles DROP CONSTRAINT user_roles_pkey")
    op.execute("ALTER TABLE user_roles DROP COLUMN IF EXISTS id")

    # Restore org_id as NOT NULL
    op.execute("UPDATE user_roles SET org_id = 0 WHERE org_id IS NULL")
    op.execute("ALTER TABLE user_roles ALTER COLUMN org_id SET NOT NULL")

    # Restore composite primary key
    op.execute("ALTER TABLE user_roles ADD PRIMARY KEY (user_id, role_id, org_id)")

    # Drop chapter creator_id
    op.drop_constraint("chapter_creator_id_fkey", "chapter", type_="foreignkey")
    op.drop_column("chapter", "creator_id")
