"""Deduplicate permissions table and add UNIQUE constraint on name.

Revision ID: 4f8a0d2b3c5e
Revises: 3e7f9c1a2b4d
Create Date: 2026-02-27 01:00:00.000000

The permissions table has no UNIQUE constraint on 'name'. After the repair
script and the resync migration both ran, some permission names have 2 rows
(different IDs, same name).  This migration de-duplicates them and adds the
UNIQUE index.
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

revision: str = "4f8a0d2b3c5e"
down_revision: str = "3e7f9c1a2b4d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    print("=" * 70)
    print("Dedup permissions + add UNIQUE constraint")
    print("=" * 70)

    # Find duplicate names
    dups = conn.execute(
        text(
            "SELECT name, COUNT(*) c FROM permissions GROUP BY name HAVING COUNT(*) > 1"
        )
    ).fetchall()
    print(f"\nDuplicate permission names found: {len(dups)}")

    for dup_name, _ in dups:
        # Keep the row with the lowest ID (the original), delete the rest.
        # Also update role_permissions to point at the surviving ID before deleting.
        rows = conn.execute(
            text("SELECT id FROM permissions WHERE name = :name ORDER BY id ASC"),
            {"name": dup_name},
        ).fetchall()
        keep_id = rows[0][0]
        stale_ids = [r[0] for r in rows[1:]]

        for stale_id in stale_ids:
            # Step 1: remove stale role_permissions that would conflict with the keeper
            # (i.e. the role already has an assignment to keep_id)
            conn.execute(
                text(
                    "DELETE FROM role_permissions AS rp_s "
                    "USING role_permissions AS rp_k "
                    "WHERE rp_s.permission_id = :stale "
                    "  AND rp_k.permission_id = :keep "
                    "  AND rp_s.role_id = rp_k.role_id"
                ),
                {"keep": keep_id, "stale": stale_id},
            )
            # Step 2: re-point remaining role_permissions to the keeper
            conn.execute(
                text(
                    "UPDATE role_permissions SET permission_id = :keep "
                    "WHERE permission_id = :stale"
                ),
                {"keep": keep_id, "stale": stale_id},
            )
            # Step 3: delete the stale permission row
            conn.execute(
                text("DELETE FROM permissions WHERE id = :stale"), {"stale": stale_id}
            )

    # Verify no duplicates remain
    remaining = conn.execute(
        text(
            "SELECT COUNT(*) FROM ("
            "  SELECT name FROM permissions GROUP BY name HAVING COUNT(*) > 1"
            ") sub"
        )
    ).scalar()
    print(f"Duplicate names remaining: {remaining}")

    if remaining == 0:
        # Add unique index
        op.create_unique_constraint("uq_permissions_name", "permissions", ["name"])
        print("Added UNIQUE constraint uq_permissions_name on permissions(name)")

    total_perms = conn.execute(text("SELECT COUNT(*) FROM permissions")).scalar()
    total_rp = conn.execute(text("SELECT COUNT(*) FROM role_permissions")).scalar()
    print(f"\nFinal counts: {total_perms} permissions, {total_rp} role_permissions")
    print("\nDedup complete")


def downgrade() -> None:
    op.drop_constraint("uq_permissions_name", "permissions", type_="unique")
