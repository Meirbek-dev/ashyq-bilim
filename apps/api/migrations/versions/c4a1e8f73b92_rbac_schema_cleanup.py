"""RBAC schema cleanup - align DB with refactored models

Revision ID: c4a1e8f73b92
Revises: b3f9d2c4a7e8
Create Date: 2026-02-07 12:00:00.000000

Reconcile the database schema with the refactored RBAC models:

## permissions table
- Convert resource_type, action, scope from PG enums to VARCHAR
- Drop permission_key column
- Add is_dangerous column

## roles table
- Drop parent_role_id column (hierarchy removed)

## role_permissions table
- Drop conditions, grant_type, expires_at, granted_by columns

## user_roles table
- Rename granted_at -> assigned_at
- Rename granted_by -> assigned_by
- Drop expires_at column
- Drop uq_user_roles_user_org unique constraint (allow multiple roles per user per org)

## Cleanup
- Drop permission_audit_log table
- Drop old v2 tables (if present)
- Drop unused PG enum types (auditaction, granttype, resourcetype, action, scope)
- Drop get_role_hierarchy function
- Re-seed permissions and role-permission assignments to match current SYSTEM_ROLES
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c4a1e8f73b92"
down_revision: str | None = "b3f9d2c4a7e8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# ---------------------------------------------------------------------------
# Current system role definitions (must stay in sync with permission_enums.py)
# ---------------------------------------------------------------------------
SYSTEM_ROLES = {
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


# ===========================================================================
# Helpers - use IF EXISTS to stay safe inside a single PG transaction
# ===========================================================================


def _col_exists(conn, table: str, column: str) -> bool:
    row = conn.execute(
        text("""
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = :table
              AND column_name = :column
        """),
        {"table": table, "column": column},
    ).fetchone()
    return row is not None


def _constraint_exists(conn, constraint: str) -> bool:
    row = conn.execute(
        text("""
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_schema = 'public'
              AND constraint_name = :name
        """),
        {"name": constraint},
    ).fetchone()
    return row is not None


def _table_exists(conn, table: str) -> bool:
    row = conn.execute(
        text("""
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = :table
        """),
        {"table": table},
    ).fetchone()
    return row is not None


def _create_index_if_not_exists(
    conn, index_name: str, table: str, columns: list[str]
) -> None:
    cols = ", ".join(columns)
    conn.execute(text(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table} ({cols})"))


def _drop_index_if_exists(conn, index_name: str) -> None:
    conn.execute(text(f"DROP INDEX IF EXISTS {index_name}"))


def _drop_fk_if_exists(conn, table: str, constraint: str) -> None:
    conn.execute(text(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint}"))


def _drop_col_if_exists(conn, table: str, column: str) -> None:
    conn.execute(text(f"ALTER TABLE {table} DROP COLUMN IF EXISTS {column}"))


def _drop_constraint_if_exists(conn, table: str, constraint: str) -> None:
    conn.execute(text(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint}"))


def upgrade() -> None:
    conn = op.get_bind()

    print("=" * 70)
    print("RBAC Schema Cleanup - align DB with refactored models")
    print("=" * 70)

    # ==================================================================
    # 1. permissions table
    # ==================================================================
    print("\n1. Updating permissions table...")

    # 1a. Convert resource_type enum -> VARCHAR(50)
    op.alter_column(
        "permissions",
        "resource_type",
        type_=sa.String(50),
        existing_type=sa.Enum(name="resourcetype"),
        postgresql_using="resource_type::text",
    )

    # 1b. Convert action enum -> VARCHAR(50)
    op.alter_column(
        "permissions",
        "action",
        type_=sa.String(50),
        existing_type=sa.Enum(name="action"),
        postgresql_using="action::text",
    )

    # 1c. Convert scope enum -> VARCHAR(50)
    op.alter_column(
        "permissions",
        "scope",
        type_=sa.String(50),
        existing_type=sa.Enum(name="scope"),
        postgresql_using="scope::text",
        server_default=None,
    )

    # 1d. Drop permission_key column (constraint + index first)
    _drop_constraint_if_exists(conn, "permissions", "uq_permissions_key")
    _drop_index_if_exists(conn, "idx_permissions_key")
    _drop_col_if_exists(conn, "permissions", "permission_key")

    # 1e. Add is_dangerous column
    if not _col_exists(conn, "permissions", "is_dangerous"):
        op.add_column(
            "permissions",
            sa.Column(
                "is_dangerous", sa.Boolean(), nullable=False, server_default="false"
            ),
        )

    # 1f. Drop extra indexes not in the current model
    for idx in [
        "ix_permissions_resource_type",
        "ix_permissions_action",
        "ix_permissions_resource_action",
        "idx_permissions_scope",
    ]:
        _drop_index_if_exists(conn, idx)

    print("   Done")

    # ==================================================================
    # 2. roles table
    # ==================================================================
    print("\n2. Updating roles table...")

    # 2a. Drop parent_role_id FK and column
    _drop_fk_if_exists(conn, "roles", "roles_parent_role_id_fkey")
    _drop_col_if_exists(conn, "roles", "parent_role_id")

    # 2b. Rename unique constraint uq_role_slug_org -> uq_roles_slug_org
    if _constraint_exists(conn, "uq_role_slug_org"):
        _drop_constraint_if_exists(conn, "roles", "uq_role_slug_org")
    if not _constraint_exists(conn, "uq_roles_slug_org"):
        op.create_unique_constraint("uq_roles_slug_org", "roles", ["slug", "org_id"])

    # 2c. Ensure model-expected indexes exist, drop old-named duplicates
    _create_index_if_not_exists(conn, "idx_roles_org_id", "roles", ["org_id"])
    _create_index_if_not_exists(conn, "idx_roles_slug", "roles", ["slug"])
    _drop_index_if_exists(conn, "ix_roles_org_id")
    _drop_index_if_exists(conn, "ix_roles_slug")

    print("   Done")

    # ==================================================================
    # 3. role_permissions table
    # ==================================================================
    print("\n3. Updating role_permissions table...")

    _drop_col_if_exists(conn, "role_permissions", "conditions")
    _drop_col_if_exists(conn, "role_permissions", "grant_type")
    _drop_col_if_exists(conn, "role_permissions", "expires_at")
    _drop_fk_if_exists(conn, "role_permissions", "role_permissions_granted_by_fkey")
    _drop_col_if_exists(conn, "role_permissions", "granted_by")

    # Fix index names
    _create_index_if_not_exists(
        conn, "idx_role_permissions_role", "role_permissions", ["role_id"]
    )
    _create_index_if_not_exists(
        conn, "idx_role_permissions_permission", "role_permissions", ["permission_id"]
    )
    for idx in [
        "ix_role_permissions_role_id",
        "ix_role_permissions_role_perm",
        "idx_role_permissions_permission_id",
    ]:
        _drop_index_if_exists(conn, idx)

    print("   Done")

    # ==================================================================
    # 4. user_roles table
    # ==================================================================
    print("\n4. Updating user_roles table...")

    # 4a. Drop indexes referencing columns we'll rename/drop
    _drop_index_if_exists(conn, "ix_user_roles_org_user")
    _drop_index_if_exists(conn, "idx_user_roles_expires_at")

    # 4b. Drop expires_at
    _drop_col_if_exists(conn, "user_roles", "expires_at")

    # 4c. Rename granted_at -> assigned_at
    if _col_exists(conn, "user_roles", "granted_at"):
        op.alter_column("user_roles", "granted_at", new_column_name="assigned_at")

    # 4d. Rename granted_by -> assigned_by (drop FK first, then rename, re-create FK)
    _drop_fk_if_exists(conn, "user_roles", "user_roles_granted_by_fkey")
    if _col_exists(conn, "user_roles", "granted_by"):
        op.alter_column("user_roles", "granted_by", new_column_name="assigned_by")
    if not _constraint_exists(conn, "user_roles_assigned_by_fkey"):
        op.create_foreign_key(
            "user_roles_assigned_by_fkey",
            "user_roles",
            "user",
            ["assigned_by"],
            ["id"],
            ondelete="SET NULL",
        )

    # 4e. Drop the one-role-per-user-per-org unique constraint
    _drop_constraint_if_exists(conn, "user_roles", "uq_user_roles_user_org")

    # 4f. Fix index names
    _create_index_if_not_exists(
        conn, "idx_user_roles_user_org", "user_roles", ["user_id", "org_id"]
    )
    _create_index_if_not_exists(conn, "idx_user_roles_role", "user_roles", ["role_id"])
    for idx in [
        "ix_user_roles_user_id",
        "ix_user_roles_org_id",
        "ix_user_roles_user_org",
        "idx_user_roles_role_id",
    ]:
        _drop_index_if_exists(conn, idx)

    print("   Done")

    # ==================================================================
    # 5. Drop permission_audit_log table
    # ==================================================================
    print("\n5. Dropping permission_audit_log...")

    # Drop the table with CASCADE to avoid lock issues
    # CASCADE will automatically drop all indexes, constraints, and dependencies
    conn.execute(text("DROP TABLE IF EXISTS permission_audit_log CASCADE"))

    print("   Done")

    # ==================================================================
    # 6. Drop old v2 tables (if they exist)
    # ==================================================================
    print("\n6. Dropping old v2 tables (if present)...")
    for tbl in [
        "permission_audit_log_v2",
        "user_roles_v2",
        "role_permissions_v2",
        "roles_v2",
        "permissions_v2",
    ]:
        conn.execute(text(f"DROP TABLE IF EXISTS {tbl} CASCADE"))
    print("   Done")

    # ==================================================================
    # 7. Drop unused enum types
    # ==================================================================
    print("\n7. Dropping unused enum types...")
    for enum_name in ["auditaction", "granttype", "resourcetype", "action", "scope"]:
        conn.execute(text(f"DROP TYPE IF EXISTS {enum_name} CASCADE"))
    print("   Done")

    # ==================================================================
    # 8. Drop get_role_hierarchy function
    # ==================================================================
    print("\n8. Dropping get_role_hierarchy function...")
    conn.execute(text("DROP FUNCTION IF EXISTS get_role_hierarchy(INTEGER, INTEGER)"))
    conn.execute(text("DROP FUNCTION IF EXISTS user_has_permission"))
    print("   Done")

    # ==================================================================
    # 8.5 Remove deprecated org-admin role rows (with assignment remap)
    # ==================================================================
    print("\n8.5 Removing deprecated org-admin role...")
    org_admin_rows = conn.execute(
        text("SELECT id FROM roles WHERE slug = 'org-admin'")
    ).fetchall()
    org_admin_ids = [row[0] for row in org_admin_rows]

    if org_admin_ids:
        admin_row = conn.execute(
            text("SELECT id FROM roles WHERE slug = 'admin' AND org_id IS NULL LIMIT 1")
        ).fetchone()
        maintainer_row = conn.execute(
            text(
                "SELECT id FROM roles WHERE slug = 'maintainer' AND org_id IS NULL LIMIT 1"
            )
        ).fetchone()
        user_row = conn.execute(
            text("SELECT id FROM roles WHERE slug = 'user' AND org_id IS NULL LIMIT 1")
        ).fetchone()
        replacement_role_id = (
            admin_row[0]
            if admin_row
            else (
                maintainer_row[0]
                if maintainer_row
                else (user_row[0] if user_row else None)
            )
        )

        if replacement_role_id is not None:
            # Explicitly guarantee admin user_id=1 keeps privileged role per org.
            for org_admin_id in org_admin_ids:
                conn.execute(
                    text(
                        """
                        INSERT INTO user_roles (user_id, role_id, org_id, assigned_at, assigned_by)
                        SELECT ur.user_id, :replacement_role_id, ur.org_id, NOW(), NULL
                        FROM user_roles ur
                        WHERE ur.user_id = 1
                          AND ur.role_id = :org_admin_id
                          AND NOT EXISTS (
                              SELECT 1
                              FROM user_roles x
                              WHERE x.user_id = ur.user_id
                                AND x.org_id IS NOT DISTINCT FROM ur.org_id
                                AND x.role_id = :replacement_role_id
                          )
                        """
                    ),
                    {
                        "replacement_role_id": replacement_role_id,
                        "org_admin_id": org_admin_id,
                    },
                )

            for org_admin_id in org_admin_ids:
                conn.execute(
                    text(
                        """
                        UPDATE user_roles
                        SET role_id = :replacement_role_id
                        WHERE role_id = :org_admin_id
                          AND NOT EXISTS (
                              SELECT 1
                              FROM user_roles ur2
                              WHERE ur2.user_id = user_roles.user_id
                                AND ur2.org_id IS NOT DISTINCT FROM user_roles.org_id
                                AND ur2.role_id = :replacement_role_id
                          )
                        """
                    ),
                    {
                        "replacement_role_id": replacement_role_id,
                        "org_admin_id": org_admin_id,
                    },
                )
                conn.execute(
                    text("DELETE FROM user_roles WHERE role_id = :org_admin_id"),
                    {"org_admin_id": org_admin_id},
                )
        else:
            print(
                "   Warning: no replacement role found for org-admin assignments; "
                "keeping user_roles rows to avoid data loss"
            )

    # Remove deprecated role row only when there are no remaining assignments.
    conn.execute(
        text(
            """
            DELETE FROM roles r
            WHERE r.slug = 'org-admin'
              AND NOT EXISTS (
                  SELECT 1 FROM user_roles ur WHERE ur.role_id = r.id
              )
            """
        )
    )
    print("   Done")

    # ==================================================================
    # 9. Re-seed permissions and role-permission mappings
    # ==================================================================
    print("\n9. Re-seeding permissions and role-permission assignments...")
    _reseed_permissions_and_roles(conn)
    print("   Done")

    print("\n" + "=" * 70)
    print("RBAC Schema Cleanup Complete")
    print("=" * 70)


def downgrade() -> None:
    """Reverse the schema cleanup (best-effort)."""
    conn = op.get_bind()

    # Re-create enum types
    conn.execute(
        text("""
        CREATE TYPE resourcetype AS ENUM (
            'organization', 'course', 'chapter', 'activity', 'assignment', 'quiz',
            'user', 'usergroup', 'collection', 'role', 'certificate', 'discussion',
            'file', 'analytics', 'trail', 'exam', 'payment', 'api_token'
        )
    """)
    )
    conn.execute(
        text("""
        CREATE TYPE action AS ENUM (
            'create', 'read', 'update', 'delete', 'manage', 'moderate',
            'export', 'invite', 'grade', 'submit', 'enroll'
        )
    """)
    )
    conn.execute(text("CREATE TYPE scope AS ENUM ('all', 'own', 'assigned', 'org')"))
    conn.execute(
        text("CREATE TYPE auditaction AS ENUM ('CHECK', 'GRANT', 'REVOKE', 'DENY')")
    )
    conn.execute(text("CREATE TYPE granttype AS ENUM ('ALLOW', 'DENY')"))

    # Re-create permission_audit_log
    op.create_table(
        "permission_audit_log",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("org_id", sa.Integer(), nullable=True),
        sa.Column(
            "action",
            postgresql.ENUM("CHECK", "GRANT", "REVOKE", "DENY", name="auditaction"),
            nullable=False,
            server_default="CHECK",
        ),
        sa.Column("resource_type", sa.String(50), nullable=True),
        sa.Column("resource_id", sa.String(100), nullable=True),
        sa.Column("permission_name", sa.String(100), nullable=True),
        sa.Column("result", sa.Boolean(), nullable=False),
        sa.Column("context", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"], ondelete="SET NULL"),
    )

    # user_roles: rename columns back
    if _col_exists(conn, "user_roles", "assigned_at"):
        op.alter_column("user_roles", "assigned_at", new_column_name="granted_at")
    _drop_fk_if_exists(conn, "user_roles", "user_roles_assigned_by_fkey")
    if _col_exists(conn, "user_roles", "assigned_by"):
        op.alter_column("user_roles", "assigned_by", new_column_name="granted_by")

    # user_roles: re-add expires_at
    if not _col_exists(conn, "user_roles", "expires_at"):
        op.add_column(
            "user_roles",
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        )

    # user_roles: re-add unique constraint
    if not _constraint_exists(conn, "uq_user_roles_user_org"):
        op.create_unique_constraint(
            "uq_user_roles_user_org", "user_roles", ["user_id", "org_id"]
        )

    # role_permissions: re-add dropped columns
    if not _col_exists(conn, "role_permissions", "conditions"):
        op.add_column(
            "role_permissions",
            sa.Column(
                "conditions", postgresql.JSONB(astext_type=sa.Text()), nullable=True
            ),
        )
    if not _col_exists(conn, "role_permissions", "grant_type"):
        op.add_column(
            "role_permissions",
            sa.Column(
                "grant_type",
                postgresql.ENUM("ALLOW", "DENY", name="granttype"),
                nullable=False,
                server_default="ALLOW",
            ),
        )
    if not _col_exists(conn, "role_permissions", "expires_at"):
        op.add_column(
            "role_permissions",
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        )
    if not _col_exists(conn, "role_permissions", "granted_by"):
        op.add_column(
            "role_permissions", sa.Column("granted_by", sa.Integer(), nullable=True)
        )

    # roles: re-add parent_role_id
    if not _col_exists(conn, "roles", "parent_role_id"):
        op.add_column("roles", sa.Column("parent_role_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "roles_parent_role_id_fkey",
            "roles",
            "roles",
            ["parent_role_id"],
            ["id"],
            ondelete="SET NULL",
        )

    # permissions: drop is_dangerous, re-add permission_key
    _drop_col_if_exists(conn, "permissions", "is_dangerous")
    if not _col_exists(conn, "permissions", "permission_key"):
        op.add_column(
            "permissions", sa.Column("permission_key", sa.String(), nullable=True)
        )
        conn.execute(text("UPDATE permissions SET permission_key = name"))
        if not _constraint_exists(conn, "uq_permissions_key"):
            op.create_unique_constraint(
                "uq_permissions_key", "permissions", ["permission_key"]
            )

    # Convert varchar back to enums
    op.alter_column(
        "permissions",
        "resource_type",
        type_=postgresql.ENUM(name="resourcetype", create_type=False),
        postgresql_using="resource_type::resourcetype",
    )
    op.alter_column(
        "permissions",
        "action",
        type_=postgresql.ENUM(name="action", create_type=False),
        postgresql_using="action::action",
    )
    op.alter_column(
        "permissions",
        "scope",
        type_=postgresql.ENUM(name="scope", create_type=False),
        postgresql_using="scope::scope",
        server_default="all",
    )


# ===========================================================================
# Data seeding
# ===========================================================================


def _reseed_permissions_and_roles(conn) -> None:
    """
    Ensure every permission string referenced by SYSTEM_ROLES exists in the
    permissions table, and that each system role's role_permissions rows match.
    """
    # Collect every concrete permission from SYSTEM_ROLES (skip wildcards)
    all_perms: set[str] = set()
    for role_def in SYSTEM_ROLES.values():
        for p in role_def["permissions"]:
            if "*" not in p:
                all_perms.add(p)

    # Upsert each permission (include created_at so default constraints aren't required)
    for perm_name in sorted(all_perms):
        resource_type, action_val, scope_val = perm_name.split(":")
        conn.execute(
            text("""
                INSERT INTO permissions (name, resource_type, action, scope, created_at)
                VALUES (:name, :resource_type, :action, :scope, NOW())
                ON CONFLICT (name) DO NOTHING
            """),
            {
                "name": perm_name,
                "resource_type": resource_type,
                "action": action_val,
                "scope": scope_val,
            },
        )

    # Load permission id map
    rows = conn.execute(text("SELECT id, name FROM permissions")).fetchall()
    perm_ids = {row[1]: row[0] for row in rows}

    # Upsert system roles and their permissions
    for slug, role_def in SYSTEM_ROLES.items():
        # Ensure the role exists
        conn.execute(
            text("""
                INSERT INTO roles (
                    slug, name, description, is_system, priority, org_id, created_at, updated_at
                )
                VALUES (:slug, :name, :description, true, :priority, NULL, NOW(), NOW())
                ON CONFLICT ON CONSTRAINT uq_roles_slug_org DO UPDATE
                SET name = :name,
                    description = :description,
                    priority = :priority,
                    updated_at = NOW()
            """),
            {
                "slug": slug,
                "name": role_def["name"],
                "description": role_def["description"],
                "priority": role_def["priority"],
            },
        )

        # Get role id
        role_row = conn.execute(
            text("SELECT id FROM roles WHERE slug = :slug AND org_id IS NULL"),
            {"slug": slug},
        ).fetchone()
        if not role_row:
            continue
        role_id = role_row[0]

        # Clear existing role_permissions for this role, then re-insert
        conn.execute(
            text("DELETE FROM role_permissions WHERE role_id = :role_id"),
            {"role_id": role_id},
        )

        for perm_name in role_def["permissions"]:
            if "*" in perm_name:
                matched = _expand_wildcard(perm_name, perm_ids)
            else:
                pid = perm_ids.get(perm_name)
                matched = [pid] if pid else []

            for pid in matched:
                conn.execute(
                    text("""
                        INSERT INTO role_permissions (role_id, permission_id, granted_at)
                        VALUES (:role_id, :pid, NOW())
                        ON CONFLICT (role_id, permission_id) DO NOTHING
                    """),
                    {"role_id": role_id, "pid": pid},
                )


def _expand_wildcard(pattern: str, perm_ids: dict[str, int]) -> list[int]:
    """Expand a wildcard permission pattern against existing permission names."""
    parts = pattern.split(":")
    matched = []
    for name, pid in perm_ids.items():
        name_parts = name.split(":")
        if len(name_parts) != 3:
            continue
        if all(pp in ("*", np) for pp, np in zip(parts, name_parts, strict=False)):
            matched.append(pid)
    return matched
