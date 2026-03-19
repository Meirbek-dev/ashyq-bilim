"""Resync system role permissions from SYSTEM_ROLES definition

Revision ID: 3e7f9c1a2b4d
Revises: 2d4e6f8a9b0c
Create Date: 2026-02-27 00:00:00.000000

All prior permission-seeding migrations (69fd16a5d534 and d8f9a1e3b5f9) ran
when the permissions table was empty, so they produced no rows.  The repair
script later seeded old-style :own-scoped org permissions, but admin's
wildcard *:*:* was never re-expanded to include the new :org-scoped variants.

This migration is the authoritative resync: it derives every concrete
permission from the current SYSTEM_ROLES definition (expanding wildcards
against the full enum set rather than existing DB rows) and rebuilds
role_permissions for all system roles.

The permissions it guarantees exist (key ones that were missing):
  organization:read:org
  organization:manage:org
  organization:update:org
  organization:delete:org
  ... plus every other combination required by non-admin roles
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

revision: str = "3e7f9c1a2b4d"
down_revision: str = "2d4e6f8a9b0c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# ---------------------------------------------------------------------------
# Full enum lists (must stay in sync with permission_enums.py)
# ---------------------------------------------------------------------------
ALL_RESOURCES = [
    "organization",
    "course",
    "chapter",
    "activity",
    "assignment",
    "quiz",
    "user",
    "usergroup",
    "collection",
    "role",
    "certificate",
    "discussion",
    "file",
    "analytics",
    "trail",
    "exam",
    "payment",
    "api_token",
]
ALL_ACTIONS = [
    "create",
    "read",
    "update",
    "delete",
    "manage",
    "moderate",
    "export",
    "grade",
    "submit",
    "enroll",
]
ALL_SCOPES = ["all", "own", "assigned", "org"]

# ---------------------------------------------------------------------------
# SYSTEM_ROLES (mirror of permission_enums.py – keep in sync)
# ---------------------------------------------------------------------------
SYSTEM_ROLES: dict[str, dict] = {
    "admin": {
        "name": "Администратор",
        "description": "Администратор платформы с полным доступом к системе",
        "priority": 100,
        "permissions": ["*:*:*"],
    },
    "maintainer": {
        "name": "Куратор",
        "description": "Куратор курсов с расширенными правами на контент",
        "priority": 70,
        "permissions": [
            "course:create:org",
            "course:read:all",
            "course:update:org",
            "course:delete:own",
            "course:manage:own",
            "chapter:*:org",
            "activity:*:org",
            "assignment:*:org",
            "quiz:*:org",
            "exam:*:org",
            "collection:create:org",
            "collection:read:all",
            "collection:update:own",
            "collection:delete:own",
            "discussion:moderate:org",
            "analytics:read:own",
            "certificate:create:own",
            "certificate:read:own",
        ],
    },
    "instructor": {
        "name": "Преподаватель",
        "description": "Преподаватель с возможностью создавать контент",
        "priority": 50,
        "permissions": [
            "course:create:org",
            "course:read:all",
            "course:update:own",
            "course:delete:own",
            "chapter:create:own",
            "chapter:read:all",
            "chapter:update:own",
            "chapter:delete:own",
            "activity:create:own",
            "activity:read:all",
            "activity:update:own",
            "activity:delete:own",
            "assignment:*:own",
            "quiz:*:own",
            "exam:*:own",
            "collection:create:org",
            "collection:read:all",
            "collection:update:own",
            "discussion:moderate:own",
            "analytics:read:own",
            "user:read:assigned",
        ],
    },
    "moderator": {
        "name": "Модератор",
        "description": "Модератор контента и обсуждений",
        "priority": 40,
        "permissions": [
            "course:read:all",
            "discussion:moderate:org",
            "discussion:read:all",
            "discussion:update:org",
            "discussion:delete:org",
            "user:read:org",
        ],
    },
    "user": {
        "name": "Пользователь",
        "description": "Пользователь с базовым доступом",
        "priority": 10,
        "permissions": [
            "course:read:all",
            "course:enroll:all",
            "chapter:read:all",
            "activity:read:all",
            "assignment:submit:assigned",
            "assignment:read:assigned",
            "quiz:submit:assigned",
            "quiz:read:assigned",
            "exam:submit:assigned",
            "exam:read:assigned",
            "collection:read:all",
            "discussion:create:org",
            "discussion:read:all",
            "discussion:update:own",
            "discussion:delete:own",
            "user:read:own",
            "user:update:own",
            "certificate:read:own",
        ],
    },
}


def _expand(pattern: str) -> list[str]:
    """Expand a permission pattern (possibly with * wildcards) to concrete names."""
    parts = pattern.split(":")
    if len(parts) != 3:
        return []
    r_pat, a_pat, s_pat = parts
    resources = ALL_RESOURCES if r_pat == "*" else [r_pat]
    actions = ALL_ACTIONS if a_pat == "*" else [a_pat]
    scopes = ALL_SCOPES if s_pat == "*" else [s_pat]
    return [f"{r}:{a}:{s}" for r in resources for a in actions for s in scopes]


def _collect_all_perms() -> dict[str, tuple[str, str, str]]:
    """Return {name: (resource, action, scope)} for every concrete permission."""
    result: dict[str, tuple[str, str, str]] = {}
    for role_def in SYSTEM_ROLES.values():
        for pattern in role_def["permissions"]:
            for name in _expand(pattern):
                r, a, s = name.split(":")
                result[name] = (r, a, s)
    return result


def upgrade() -> None:
    conn = op.get_bind()

    print("=" * 70)
    print("Resync system role permissions")
    print("=" * 70)

    # ------------------------------------------------------------------
    # 1. Collect all concrete permissions needed by SYSTEM_ROLES
    # ------------------------------------------------------------------
    all_perms = _collect_all_perms()
    print(f"\n1. Total concrete permissions to ensure: {len(all_perms)}")

    # ------------------------------------------------------------------
    # 2. Upsert permissions (insert missing, skip existing)
    # ------------------------------------------------------------------
    existing_rows = conn.execute(text("SELECT name FROM permissions")).fetchall()
    existing_names = {row[0] for row in existing_rows}

    inserted = 0
    for name, (res, act, scp) in all_perms.items():
        if name not in existing_names:
            conn.execute(
                text(
                    "INSERT INTO permissions "
                    "(name, resource_type, action, scope, created_at) "
                    "VALUES (:name, :resource_type, :action, :scope, NOW())"
                ),
                {"name": name, "resource_type": res, "action": act, "scope": scp},
            )
            inserted += 1

    print(
        f"   Inserted {inserted} new permissions ({len(existing_names)} already existed)"
    )

    # ------------------------------------------------------------------
    # 3. Reload permission id map
    # ------------------------------------------------------------------
    perm_rows = conn.execute(text("SELECT id, name FROM permissions")).fetchall()
    perm_ids: dict[str, int] = {row[1]: row[0] for row in perm_rows}

    # ------------------------------------------------------------------
    # 4. Rebuild role_permissions for each system role
    # ------------------------------------------------------------------
    print("\n4. Rebuilding role_permissions for system roles...")

    for slug, role_def in SYSTEM_ROLES.items():
        role_row = conn.execute(
            text("SELECT id FROM roles WHERE slug = :slug AND org_id IS NULL"),
            {"slug": slug},
        ).fetchone()
        if not role_row:
            print(f"   ⚠  Role '{slug}' not found, skipping")
            continue
        role_id = role_row[0]

        # Gather concrete perm ids for this role
        needed_perm_ids: set[int] = set()
        for pattern in role_def["permissions"]:
            for name in _expand(pattern):
                pid = perm_ids.get(name)
                if pid:
                    needed_perm_ids.add(pid)

        # Determine current role_permissions
        existing_rp = {
            row[0]
            for row in conn.execute(
                text("SELECT permission_id FROM role_permissions WHERE role_id = :rid"),
                {"rid": role_id},
            ).fetchall()
        }

        to_add = needed_perm_ids - existing_rp
        to_remove = existing_rp - needed_perm_ids

        # Remove stale assignments
        for pid in to_remove:
            conn.execute(
                text(
                    "DELETE FROM role_permissions "
                    "WHERE role_id = :rid AND permission_id = :pid"
                ),
                {"rid": role_id, "pid": pid},
            )

        # Add missing assignments
        for pid in to_add:
            conn.execute(
                text(
                    "INSERT INTO role_permissions (role_id, permission_id, granted_at) "
                    "VALUES (:rid, :pid, NOW()) "
                    "ON CONFLICT (role_id, permission_id) DO NOTHING"
                ),
                {"rid": role_id, "pid": pid},
            )

        print(
            f"   {slug:12s}: +{len(to_add)} added, -{len(to_remove)} removed "
            f"→ {len(needed_perm_ids)} total"
        )

    # ------------------------------------------------------------------
    # 5. Remove orphaned duplicate role_permissions created by repair script
    # ------------------------------------------------------------------
    deduped = conn.execute(
        text("""
            WITH ranked AS (
                SELECT ctid,
                       ROW_NUMBER() OVER (
                           PARTITION BY role_id, permission_id
                           ORDER BY granted_at ASC NULLS FIRST
                       ) AS rn
                FROM role_permissions
            )
            DELETE FROM role_permissions
            WHERE ctid IN (SELECT ctid FROM ranked WHERE rn > 1)
        """)
    ).rowcount
    if deduped:
        print(f"\n5. Removed {deduped} duplicate role_permissions rows")

    # ------------------------------------------------------------------
    # 6. Verify organization:read:org is now present for admin
    # ------------------------------------------------------------------
    check = conn.execute(
        text("""
            SELECT COUNT(*) FROM role_permissions rp
            JOIN roles r ON r.id = rp.role_id
            JOIN permissions p ON p.id = rp.permission_id
            WHERE r.slug = 'admin' AND r.org_id IS NULL
              AND p.name = 'organization:read:org'
        """)
    ).scalar()
    print(
        f"\n6. organization:read:org assigned to admin: {'✅ yes' if check else '❌ NO'}"
    )

    print("\n✅ Resync complete")


def downgrade() -> None:
    # No safe rollback: we cannot know which permissions were pre-existing.
    # A downgrade would risk removing legitimately-existing data.
    print("Downgrade not implemented for permission resync.")
