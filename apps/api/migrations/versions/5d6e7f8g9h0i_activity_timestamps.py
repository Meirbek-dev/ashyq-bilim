"""activity_timestamps_to_timestamptz

Revision ID: 5d6e7f8g9h0i
Revises: 4c5d6e7f8g9h
Create Date: 2026-02-11 00:30:00.000000

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5d6e7f8g9h0i"
down_revision: str | None = "4c5d6e7f8g9h"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    # Create new timestamptz columns
    op.add_column(
        "activity", sa.Column("creation_ts", sa.TIMESTAMP(timezone=True), nullable=True)
    )
    op.add_column(
        "activity", sa.Column("update_ts", sa.TIMESTAMP(timezone=True), nullable=True)
    )

    # Backfill with casting. If parsing fails for any row, abort so operator can manually resolve.
    try:
        conn.execute(
            sa.text(
                "UPDATE activity SET creation_ts = NULLIF(creation_date, '')::timestamptz WHERE creation_date IS NOT NULL AND creation_date <> ''"
            )
        )
        conn.execute(
            sa.text(
                "UPDATE activity SET update_ts = NULLIF(update_date, '')::timestamptz WHERE update_date IS NOT NULL AND update_date <> ''"
            )
        )
    except Exception as e:
        raise RuntimeError(
            "Failed to parse existing creation_date/update_date values into timestamptz. Fix data before running this migration. Error: "
            + str(e)
        )

    # Verify whether any rows still have non-empty date strings but null timestamps (indicates parse failures)
    res = conn.execute(
        sa.text(
            "SELECT id, creation_date, update_date FROM activity WHERE (creation_date IS NOT NULL AND creation_date <> '' AND creation_ts IS NULL) OR (update_date IS NOT NULL AND update_date <> '' AND update_ts IS NULL) LIMIT 10"
        )
    ).fetchall()
    if res:
        msg = (
            f"Some date values could not be parsed into timestamptz. Sample rows: {res}"
        )
        raise RuntimeError(msg)

    # If all good, drop old columns and rename
    op.drop_column("activity", "creation_date")
    op.drop_column("activity", "update_date")
    op.alter_column("activity", "creation_ts", new_column_name="creation_date")
    op.alter_column("activity", "update_ts", new_column_name="update_date")

    # Make not-null and set defaults
    op.alter_column(
        "activity", "creation_date", nullable=False, server_default=sa.text("now()")
    )
    op.alter_column(
        "activity", "update_date", nullable=False, server_default=sa.text("now()")
    )


def downgrade() -> None:
    # Revert: add string columns back and cast timestamps to text
    op.add_column("activity", sa.Column("creation_date_str", sa.Text(), nullable=True))
    op.add_column("activity", sa.Column("update_date_str", sa.Text(), nullable=True))
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE activity SET creation_date_str = creation_date::text, update_date_str = update_date::text"
        )
    )
    op.drop_column("activity", "creation_date")
    op.drop_column("activity", "update_date")
    op.alter_column("activity", "creation_date_str", new_column_name="creation_date")
    op.alter_column("activity", "update_date_str", new_column_name="update_date")
