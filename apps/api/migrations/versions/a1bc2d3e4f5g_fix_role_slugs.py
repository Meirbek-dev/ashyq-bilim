"""fix missing/invalid role slugs

Revision ID: a1bc2d3e4f5g
Revises: 5447127d3297
Create Date: 2026-02-22 19:00:00.000000

This migration repairs any existing role rows that lack a slug or contain an
empty string, normalizing them to a valid value derived from the role name.
It then adds database constraints to prevent empty/invalid slugs in the
future.

The slug generation logic mirrors the lightweight "slugify" helper used in
`src/db/permissions.py`.
"""

import re
from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

# attempt to leverage shared slugify logic so we don't drift; fall back to
# local copy if import fails (e.g. when migrations run in isolated context).
try:
    from src.db.permissions import slugify as _slugify
except ImportError:  # pragma: no cover - defensive

    def _slugify(name: str) -> str:  # type: ignore
        return re.sub(r"[^a-z0-9_]", "", re.sub(r"\s+", "_", name.strip().lower()))


# revision identifiers, used by Alembic.
revision: str = "a1bc2d3e4f5g"
down_revision: str | None = "5447127d3297"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# lightweight slugify to match frontend behaviour


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9_]", "", re.sub(r"\s+", "_", name.strip().lower()))


def upgrade() -> None:
    conn = op.get_bind()

    # ------------------------------------------------------------------
    # 1. fix existing rows with null/empty slug
    # ------------------------------------------------------------------
    # include any row whose slug doesn't satisfy the new format so we
    # can normalize it before adding the constraint
    rows = conn.execute(
        text(
            "SELECT id, name, slug, org_id FROM roles"
            " WHERE slug IS NULL OR slug = '' OR slug !~ '^[a-z0-9_]+$'"
        )
    ).fetchall()

    for r in rows:
        role_id = r[0]
        name = r[1] or ""
        org_id = r[3]

        # prefer deriving from the *name* rather than the existing slug; we
        # assume the name is human-readable and easier to fix.  If the name is
        # blank we fall back to constructing a placeholder based on ID.
        base = _slugify(name)
        if not base:
            base = f"role_{role_id}"

        candidate = base
        counter = 1
        while True:
            existing = conn.execute(
                text(
                    "SELECT COUNT(*) FROM roles WHERE slug = :slug AND "
                    "(org_id IS NOT DISTINCT FROM :org_id) AND id != :id"
                ),
                {"slug": candidate, "org_id": org_id, "id": role_id},
            ).scalar()
            if existing == 0:
                break
            candidate = f"{base}_{counter}"
            counter += 1

        conn.execute(
            text("UPDATE roles SET slug = :slug WHERE id = :id"),
            {"slug": candidate, "id": role_id},
        )

    # ------------------------------------------------------------------
    # 2. enforce constraints to stop bad data in future
    # ------------------------------------------------------------------
    # make sure column is non-null (should already be but be explicit)
    op.alter_column("roles", "slug", nullable=False)

    # ensure slug contains only lowercase letters, numbers and underscores
    op.create_check_constraint(
        "ck_roles_slug_format",
        "roles",
        "slug ~ '^[a-z0-9_]+$'",
    )
    # disallow empty strings (in case the above regex permits zero length)
    op.create_check_constraint(
        "ck_roles_slug_not_empty",
        "roles",
        "slug <> ''",
    )


def downgrade() -> None:
    # Constraints can be dropped on downgrade; we do not undo the data
    # normalization because it's safe to leave updated values.
    op.drop_constraint("ck_roles_slug_not_empty", "roles", type_="check")
    op.drop_constraint("ck_roles_slug_format", "roles", type_="check")
    # make column nullable again (downgrade only)
    op.alter_column("roles", "slug", nullable=True)
