"""course_timestamps_to_timestamptz

Revision ID: 7f8g9h0i1j2k
Revises: 6e7f8g9h0i1j
Create Date: 2026-02-11 01:00:00.000000

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7f8g9h0i1j2k"
down_revision: str | None = "6e7f8g9h0i1j"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    # Add new timestamptz columns
    op.add_column(
        "course", sa.Column("creation_ts", sa.TIMESTAMP(timezone=True), nullable=True)
    )
    op.add_column(
        "course", sa.Column("update_ts", sa.TIMESTAMP(timezone=True), nullable=True)
    )

    # Backfill values, abort if parse fails
    try:
        conn.execute(
            sa.text(
                "UPDATE course SET creation_ts = NULLIF(creation_date, '')::timestamptz WHERE creation_date IS NOT NULL AND creation_date <> ''"
            )
        )
        conn.execute(
            sa.text(
                "UPDATE course SET update_ts = NULLIF(update_date, '')::timestamptz WHERE update_date IS NOT NULL AND update_date <> ''"
            )
        )
    except Exception as e:
        raise RuntimeError(
            "Failed to parse existing course creation_date/update_date values into timestamptz. Fix data before running this migration. Error: "
            + str(e)
        )

    # Verify presence of unparsable rows
    res = conn.execute(
        sa.text(
            "SELECT id, creation_date, update_date FROM course WHERE (creation_date IS NOT NULL AND creation_date <> '' AND creation_ts IS NULL) OR (update_date IS NOT NULL AND update_date <> '' AND update_ts IS NULL) LIMIT 10"
        )
    ).fetchall()
    if res:
        msg = f"Some course date values could not be parsed into timestamptz. Sample rows: {res}"
        raise RuntimeError(msg)

    # Drop old columns, rename backfilled ones
    op.drop_column("course", "creation_date")
    op.drop_column("course", "update_date")
    op.alter_column("course", "creation_ts", new_column_name="creation_date")
    op.alter_column("course", "update_ts", new_column_name="update_date")

    # Set not-null and defaults
    op.alter_column(
        "course", "creation_date", nullable=False, server_default=sa.text("now()")
    )
    op.alter_column(
        "course", "update_date", nullable=False, server_default=sa.text("now()")
    )


def downgrade() -> None:
    # Revert to text columns
    op.add_column("course", sa.Column("creation_date_str", sa.Text(), nullable=True))
    op.add_column("course", sa.Column("update_date_str", sa.Text(), nullable=True))
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE course SET creation_date_str = creation_date::text, update_date_str = update_date::text"
        )
    )
    op.drop_column("course", "creation_date")
    op.drop_column("course", "update_date")
    op.alter_column("course", "creation_date_str", new_column_name="creation_date")
    op.alter_column("course", "update_date_str", new_column_name="update_date")
