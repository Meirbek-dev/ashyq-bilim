"""convert_json_to_jsonb_gin_indexes

Revision ID: 3b4c5d6e7f8g
Revises: 2a3b4c5d6e7f
Create Date: 2026-02-11 00:10:00.000000

"""

import contextlib
from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3b4c5d6e7f8g"
down_revision: str | None = "2a3b4c5d6e7f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (table, column, index_name)
TARGETS = [
    ("activity", "details", "idx_activity_details_gin"),
    ("block", "content", "idx_block_content_gin"),
    ('"user"', "details", "idx_user_details_gin"),
    ('"user"', "profile", "idx_user_profile_gin"),
    ("organization", "socials", "idx_organization_socials_gin"),
    ("organization", "links", "idx_organization_links_gin"),
    ("certifications", "config", "idx_certifications_config_gin"),
]


def upgrade() -> None:
    # Convert JSON columns to JSONB and create GIN indexes. Casts use USING col::jsonb
    failed = []
    for table, column, index_name in TARGETS:
        try:
            # Run the ALTER in an autocommit block so a single failure doesn't abort the whole migration
            with op.get_context().autocommit_block():
                op.execute(
                    sa.text(
                        f"ALTER TABLE {table} ALTER COLUMN {column} TYPE jsonb USING {column}::jsonb"
                    )
                )
        except Exception as e:
            # Record the failure and continue with other conversions
            failed.append((table, column, str(e)))
            continue
        try:
            # Create GIN index if possible (ignore failures such as index already exists)
            with op.get_context().autocommit_block():
                op.execute(
                    sa.text(
                        f"CREATE INDEX IF NOT EXISTS {index_name} ON {table} USING gin ({column})"
                    )
                )
        except Exception:
            pass
    if failed:
        msgs = ", ".join([f"{t}.{c}: {err}" for t, c, err in failed])
        msg = f"Failed to convert some columns to jsonb: {msgs}"
        raise RuntimeError(msg)


def downgrade() -> None:
    # Downgrade: revert jsonb back to json and drop GIN indexes
    for table, column, index_name in TARGETS:
        with contextlib.suppress(Exception):
            op.drop_index(index_name, table_name=table)
        with contextlib.suppress(Exception):
            op.execute(
                sa.text(
                    f"ALTER TABLE {table} ALTER COLUMN {column} TYPE json USING {column}::json"
                )
            )
