"""RBAC rewrite - Consolidated

Revision ID: 69fd16a5d534
Revises:
Create Date: 2026-01-23 22:37:32.359114

This consolidated migration includes all RBAC system changes and related enhancements:

## RBAC System (Core)
- permissions: Individual permission definitions with enum types
- roles: Role definitions with hierarchy support
- role_permissions: Junction table for role-permission assignments
- user_roles: User-role assignments per organization
- permission_audit_log: Audit logging for permission checks

## Features
- Complete permission seeding for all resources
- System role creation (admin, maintainer, instructor, moderator, user)
- Performance indexes for permission lookups
- PostgreSQL functions for role hierarchy and permission checking
- Support for permission expiration and conditional grants

## Additional Enhancements
- Creator tracking (creator_id) on courses, activities, collections, organizations, usergroups
- Enhanced audit logging with action types and resource tracking
- User data integrity (duplicate cleanup and unique constraints)
- Migration of legacy userorganization data to user_roles

## Data Migration
- Migrates existing roles and user_organizations to new RBAC schema
- Cleans up duplicate users and enforces uniqueness
- Ensures all users have proper role assignments
"""

import contextlib
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "69fd16a5d534"
# This migration is the root of the history; no parent revision exists.
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Consolidated upgrade - Creates complete RBAC system with all enhancements."""
    conn = op.get_bind()

    print("=" * 80)
    print("RBAC Consolidated Migration")
    print("=" * 80)

    # ============================================================================
    # STEP 1: Create Enum Types
    # ============================================================================
    print("\n1. Creating enum types...")

    # Drop existing enum types if they exist
    op.execute("DROP TYPE IF EXISTS resourcetype CASCADE")
    op.execute("DROP TYPE IF EXISTS action CASCADE")
    op.execute("DROP TYPE IF EXISTS scope CASCADE")
    op.execute("DROP TYPE IF EXISTS auditaction CASCADE")
    op.execute("DROP TYPE IF EXISTS granttype CASCADE")

    # Create enum types
    op.execute("""
        CREATE TYPE resourcetype AS ENUM (
            'organization', 'course', 'chapter', 'activity', 'assignment', 'quiz',
            'user', 'usergroup', 'collection', 'role', 'certificate', 'discussion',
            'file', 'analytics', 'trail', 'exam', 'payment', 'api_token'
        )
    """)

    op.execute("""
        CREATE TYPE action AS ENUM (
            'create', 'read', 'update', 'delete', 'manage', 'moderate',
            'export', 'invite', 'grade', 'submit', 'enroll'
        )
    """)

    op.execute("""
        CREATE TYPE scope AS ENUM ('all', 'own', 'assigned', 'org')
    """)

    op.execute("""
        CREATE TYPE auditaction AS ENUM ('CHECK', 'GRANT', 'REVOKE', 'DENY')
    """)

    op.execute("""
        CREATE TYPE granttype AS ENUM ('ALLOW', 'DENY')
    """)

    print("   ✅ Created enum types")

    # ============================================================================
    # STEP 2: Create RBAC Core Tables
    # ============================================================================
    print("\n2. Creating RBAC core tables...")

    # 2a. Permissions table
    op.create_table(
        "permissions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column(
            "resource_type",
            postgresql.ENUM(
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
                name="resourcetype",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "action",
            postgresql.ENUM(
                "create",
                "read",
                "update",
                "delete",
                "manage",
                "moderate",
                "export",
                "invite",
                "grade",
                "submit",
                "enroll",
                name="action",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "scope",
            postgresql.ENUM(
                "all",
                "own",
                "assigned",
                "org",
                name="scope",
                create_type=False,
            ),
            nullable=False,
            server_default="all",
        ),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("permission_key", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_permissions_name"),
        sa.UniqueConstraint("permission_key", name="uq_permissions_key"),
    )
    op.create_index("ix_permissions_resource_type", "permissions", ["resource_type"])
    op.create_index("ix_permissions_action", "permissions", ["action"])
    op.create_index(
        "ix_permissions_resource_action", "permissions", ["resource_type", "action"]
    )
    op.create_index(
        "idx_permissions_resource_action", "permissions", ["resource_type", "action"]
    )
    op.create_index("idx_permissions_scope", "permissions", ["scope"])
    op.create_index("idx_permissions_key", "permissions", ["permission_key"])
    op.create_index("idx_permissions_name", "permissions", ["name"], unique=True)
    print("   ✅ Created permissions table")

    # 2b. Roles table
    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("org_id", sa.Integer(), nullable=True),
        sa.Column("parent_role_id", sa.Integer(), nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organization.id"],
            ondelete="CASCADE",
            name="roles_org_id_fkey",
        ),
        sa.ForeignKeyConstraint(
            ["parent_role_id"],
            ["roles.id"],
            ondelete="SET NULL",
            name="roles_parent_role_id_fkey",
        ),
        sa.UniqueConstraint("slug", "org_id", name="uq_role_slug_org"),
    )
    op.create_index("ix_roles_org_id", "roles", ["org_id"])
    op.create_index("ix_roles_slug", "roles", ["slug"])
    print("   ✅ Created roles table")

    # 2c. Role Permissions junction table
    op.create_table(
        "role_permissions",
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column("permission_id", sa.Integer(), nullable=False),
        sa.Column("conditions", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "grant_type",
            postgresql.ENUM("ALLOW", "DENY", name="granttype", create_type=False),
            nullable=False,
            server_default="ALLOW",
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "granted_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("granted_by", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("role_id", "permission_id"),
        sa.ForeignKeyConstraint(
            ["role_id"],
            ["roles.id"],
            ondelete="CASCADE",
            name="role_permissions_role_id_fkey",
        ),
        sa.ForeignKeyConstraint(
            ["permission_id"], ["permissions.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["granted_by"], ["user.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_role_permissions_role_id", "role_permissions", ["role_id"])
    op.create_index(
        "ix_role_permissions_role_perm",
        "role_permissions",
        ["role_id", "permission_id"],
    )
    op.create_index(
        "idx_role_permissions_permission_id", "role_permissions", ["permission_id"]
    )
    print("   ✅ Created role_permissions table")

    # 2d. User Roles table
    op.create_table(
        "user_roles",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column(
            "granted_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("granted_by", sa.Integer(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("user_id", "role_id", "org_id"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["role_id"],
            ["roles.id"],
            ondelete="CASCADE",
            name="user_roles_role_id_fkey",
        ),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["granted_by"], ["user.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_user_roles_user_id", "user_roles", ["user_id"])
    op.create_index("ix_user_roles_org_id", "user_roles", ["org_id"])
    op.create_index("ix_user_roles_user_org", "user_roles", ["user_id", "org_id"])
    op.create_index(
        "ix_user_roles_org_user", "user_roles", ["org_id", "user_id", "expires_at"]
    )
    op.create_index("idx_user_roles_expires_at", "user_roles", ["expires_at"])
    op.create_index("idx_user_roles_role_id", "user_roles", ["role_id"])
    print("   ✅ Created user_roles table")

    # 2e. Permission Audit Log
    op.create_table(
        "permission_audit_log",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("org_id", sa.Integer(), nullable=True),
        sa.Column(
            "action",
            postgresql.ENUM(
                "CHECK",
                "GRANT",
                "REVOKE",
                "DENY",
                name="auditaction",
                create_type=False,
            ),
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
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organization.id"],
            ondelete="SET NULL",
            name="permission_audit_log_org_id_fkey",
        ),
    )
    op.create_index(
        "ix_permission_audit_user", "permission_audit_log", ["user_id", "created_at"]
    )
    op.create_index(
        "ix_permission_audit_resource",
        "permission_audit_log",
        ["resource_type", "resource_id"],
    )
    op.create_index(
        "ix_permission_audit_action", "permission_audit_log", ["action", "created_at"]
    )
    op.create_index(
        "ix_audit_log_result_created", "permission_audit_log", ["result", "created_at"]
    )
    op.create_index(
        "idx_audit_log_user_resource",
        "permission_audit_log",
        ["user_id", "resource_type", "created_at"],
    )
    print("   ✅ Created permission_audit_log table")

    # ============================================================================
    # STEP 3: Create Database Functions
    # ============================================================================
    print("\n3. Creating database functions...")

    # Function to get role hierarchy
    conn.execute(
        text("""
        CREATE OR REPLACE FUNCTION get_role_hierarchy(role_id_param INTEGER, max_depth INTEGER DEFAULT 10)
        RETURNS TABLE(role_id INTEGER, role_name VARCHAR, depth INTEGER) AS $$
        WITH RECURSIVE role_tree AS (
            SELECT id as role_id, name as role_name, parent_role_id, 0 as depth
            FROM roles
            WHERE id = role_id_param
            UNION ALL
            SELECT r.id, r.name, r.parent_role_id, rt.depth + 1
            FROM roles r
            INNER JOIN role_tree rt ON r.id = rt.parent_role_id
            WHERE rt.depth < max_depth
        )
        SELECT role_id, role_name, depth
        FROM role_tree
        ORDER BY depth;
        $$ LANGUAGE SQL STABLE;
    """)
    )
    print("   ✅ Created get_role_hierarchy function")

    # ============================================================================
    # STEP 4: Seed Default Permissions
    # ============================================================================
    print("\n4. Seeding default permissions...")
    _seed_default_permissions(conn)
    print("   ✅ Seeded permissions")

    # ============================================================================
    # STEP 5: Seed Default System Roles
    # ============================================================================
    print("\n5. Seeding default system roles...")
    _seed_default_roles(conn)
    print("   ✅ Seeded system roles")

    # ============================================================================
    # STEP 6: Migrate Legacy Data
    # ============================================================================
    print("\n6. Migrating legacy data...")

    # Migrate user_organizations to user_roles
    _migrate_user_organizations(conn)

    # Migrate legacy userorganization table if it exists
    _migrate_userorganization_table(conn)

    print("   ✅ Migrated legacy data")

    # ============================================================================
    # STEP 7: Remove rights column from role table
    # ============================================================================
    print("\n7. Cleaning up legacy role structure...")
    try:
        # Check if rights column exists in role table
        result = conn.execute(
            text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='role' AND column_name='rights'
        """)
        )
        if result.fetchone():
            op.drop_column("role", "rights")
            print("   ✅ Removed rights column from role table")
        else:
            print("   ℹ️  Rights column already removed")
    except Exception as e:
        print(f"   ⚠️  Warning: {e}")

    # ============================================================================
    # STEP 8: Add Creator ID Columns
    # ============================================================================
    print("\n8. Adding creator tracking columns...")

    # Add creator_id to courses
    _add_creator_id_column(conn, "course", "fk_course_creator_id_user")

    # Add creator_id to activities
    _add_creator_id_column(conn, "activity", "fk_activity_creator_id_user")

    # Add creator_id to collections
    _add_creator_id_column(conn, "collection", "fk_collection_creator_id_user")

    # Add creator_id to organizations
    _add_creator_id_column(conn, "organization", "fk_organization_creator_id_user")

    # Add creator_id to usergroups
    _add_creator_id_column(conn, "usergroup", "fk_usergroup_creator_id_user")

    print("   ✅ Added creator tracking")

    # ============================================================================
    # STEP 9: Clean Up Duplicate Users
    # ============================================================================
    print("\n9. Cleaning up duplicate users...")
    _cleanup_duplicate_users(conn)
    print("   ✅ Cleaned up duplicates")

    # ============================================================================
    # STEP 10: Add Unique Constraints to User Table
    # ============================================================================
    print("\n10. Adding unique constraints to user table...")
    _add_user_unique_constraints(conn)
    print("   ✅ Added unique constraints")

    # ============================================================================
    # STEP 11: Create Additional Performance Indexes
    # ============================================================================
    print("\n11. Creating additional performance indexes...")
    _create_additional_indexes(conn)
    print("   ✅ Created additional indexes")

    print("\n" + "=" * 80)
    print("✅ RBAC Consolidated Migration Complete!")
    print("=" * 80)


def downgrade() -> None:
    """Downgrade schema - Remove all RBAC tables and enhancements."""
    conn = op.get_bind()

    print("Downgrading RBAC system...")

    # Drop unique constraints from user table
    try:
        op.drop_constraint("uq_user_user_uuid", "user", type_="unique")
        op.drop_constraint("uq_user_email", "user", type_="unique")
        op.drop_constraint("uq_user_username", "user", type_="unique")
    except:  # noqa: E722
        pass

    # Drop creator_id columns
    for table_name in ["course", "activity", "collection", "organization", "usergroup"]:
        with contextlib.suppress(BaseException):
            op.drop_column(table_name, "creator_id")

    # Drop functions
    conn.execute(text("DROP FUNCTION IF EXISTS get_role_hierarchy(INTEGER, INTEGER)"))
    conn.execute(text("DROP FUNCTION IF EXISTS user_has_permission"))

    # Drop tables in reverse order
    op.drop_table("permission_audit_log")
    op.drop_table("user_roles")
    op.drop_table("role_permissions")
    op.drop_table("roles")
    op.drop_table("permissions")

    # Drop enum types
    op.execute("DROP TYPE IF EXISTS granttype CASCADE")
    op.execute("DROP TYPE IF EXISTS auditaction CASCADE")
    op.execute("DROP TYPE IF EXISTS scope CASCADE")
    op.execute("DROP TYPE IF EXISTS action CASCADE")
    op.execute("DROP TYPE IF EXISTS resourcetype CASCADE")

    print("✅ Downgrade complete")


# ==============================================================================
# Helper Functions
# ==============================================================================


def _seed_default_permissions(conn) -> None:
    """Seed the database with default permissions."""
    permissions = [
        # Organization permissions
        ("organization", "read", "own", "Read own organization"),
        ("organization", "update", "own", "Update own organization"),
        ("organization", "manage", "own", "Manage own organization settings"),
        ("organization", "delete", "own", "Delete own organization"),
        # Course permissions
        ("course", "create", "org", "Create courses in organization"),
        ("course", "read", "all", "Read all public courses"),
        ("course", "read", "own", "Read own courses"),
        ("course", "update", "own", "Update own courses"),
        ("course", "update", "org", "Update courses in organization"),
        ("course", "update", "all", "Update all courses"),
        ("course", "delete", "own", "Delete own courses"),
        ("course", "delete", "org", "Delete courses in organization"),
        ("course", "delete", "all", "Delete all courses"),
        ("course", "manage", "own", "Manage own course settings"),
        ("course", "manage", "all", "Manage all courses"),
        # Chapter permissions
        ("chapter", "create", "own", "Create chapters in own courses"),
        ("chapter", "create", "org", "Create chapters in organization"),
        ("chapter", "read", "all", "Read chapters"),
        ("chapter", "update", "own", "Update own chapters"),
        ("chapter", "update", "org", "Update chapters in organization"),
        ("chapter", "update", "all", "Update all chapters"),
        ("chapter", "delete", "own", "Delete own chapters"),
        ("chapter", "delete", "org", "Delete chapters in organization"),
        ("chapter", "delete", "all", "Delete all chapters"),
        # Activity permissions
        ("activity", "create", "own", "Create activities in own courses"),
        ("activity", "create", "org", "Create activities in organization"),
        ("activity", "read", "all", "Read activities"),
        ("activity", "update", "own", "Update own activities"),
        ("activity", "update", "org", "Update activities in organization"),
        ("activity", "update", "all", "Update all activities"),
        ("activity", "delete", "own", "Delete own activities"),
        ("activity", "delete", "org", "Delete activities in organization"),
        ("activity", "delete", "all", "Delete all activities"),
        # User permissions
        ("user", "read", "own", "Read own profile"),
        ("user", "read", "org", "Read users in organization"),
        ("user", "read", "all", "Read all users"),
        ("user", "update", "own", "Update own profile"),
        ("user", "update", "org", "Update users in organization"),
        ("user", "delete", "org", "Delete users in organization"),
        ("user", "invite", "org", "Invite users to organization"),
        ("user", "manage", "org", "Manage organization users"),
        # Usergroup permissions
        ("usergroup", "create", "org", "Create usergroups in organization"),
        ("usergroup", "read", "org", "Read usergroups in organization"),
        ("usergroup", "update", "org", "Update usergroups in organization"),
        ("usergroup", "delete", "org", "Delete usergroups in organization"),
        # Collection permissions
        ("collection", "create", "org", "Create collections in organization"),
        ("collection", "read", "all", "Read public collections"),
        ("collection", "update", "own", "Update own collections"),
        ("collection", "update", "org", "Update collections in organization"),
        ("collection", "update", "all", "Update all collections"),
        ("collection", "delete", "own", "Delete own collections"),
        ("collection", "delete", "org", "Delete collections in organization"),
        ("collection", "delete", "all", "Delete all collections"),
        # Role permissions
        ("role", "create", "org", "Create roles in organization"),
        ("role", "read", "org", "Read roles in organization"),
        ("role", "update", "org", "Update roles in organization"),
        ("role", "delete", "org", "Delete roles in organization"),
        # Certificate permissions
        ("certificate", "create", "own", "Create certificates for own courses"),
        ("certificate", "read", "all", "Read certificates"),
        # Analytics permissions
        ("analytics", "read", "own", "Read own analytics"),
        ("analytics", "read", "org", "Read organization analytics"),
        # Assignment/Quiz permissions
        ("assignment", "create", "org", "Create assignments"),
        ("assignment", "read", "all", "Read assignments"),
        ("assignment", "update", "all", "Update assignments"),
        ("assignment", "delete", "all", "Delete assignments"),
        ("assignment", "grade", "own", "Grade assignments in own courses"),
        ("assignment", "grade", "org", "Grade assignments in organization"),
        ("assignment", "submit", "all", "Submit assignments"),
        ("quiz", "grade", "own", "Grade quizzes in own courses"),
        ("quiz", "submit", "all", "Submit quizzes"),
        # Exam permissions
        ("exam", "create", "org", "Create exams in organization"),
        ("exam", "read", "own", "Read own exams"),
        ("exam", "update", "own", "Update own exams"),
        ("exam", "delete", "own", "Delete own exams"),
        # File permissions
        ("file", "create", "org", "Upload files to organization"),
        ("file", "read", "org", "Read files in organization"),
        ("file", "delete", "own", "Delete own files"),
        # API Token permissions
        ("api_token", "create", "org", "Create API tokens"),
        ("api_token", "read", "org", "Read API tokens"),
        ("api_token", "delete", "org", "Delete API tokens"),
        # Discussion permissions
        ("discussion", "moderate", "org", "Moderate discussions in organization"),
    ]

    for resource_type, action, scope, description in permissions:
        permission_key = f"{resource_type}:{action}:{scope}"
        conn.execute(
            text("""
            INSERT INTO permissions (name, resource_type, action, scope, description, permission_key)
            VALUES (
                :name,
                CAST(:resource_type AS resourcetype),
                CAST(:action AS action),
                CAST(:scope AS scope),
                :description,
                :permission_key
            )
            ON CONFLICT (name) DO UPDATE SET permission_key = :permission_key
        """),
            {
                "name": permission_key,
                "resource_type": resource_type,
                "action": action,
                "scope": scope,
                "description": description,
                "permission_key": permission_key,
            },
        )


def _seed_default_roles(conn) -> None:
    """Seed the database with default system roles."""
    # Define roles
    roles = [
        (
            "admin",
            "Администратор",
            "Администратор платформы с полным доступом",
            True,
            100,
        ),
        (
            "maintainer",
            "Куратор",
            "Управление контентом и администрирование курсов",
            True,
            70,
        ),
        ("instructor", "Преподаватель", "Создание и ведение курсов", True, 50),
        ("moderator", "Модератор", "Модерация сообщества", True, 40),
        ("user", "Пользователь", "Стандартный авторизованный пользователь", True, 10),
    ]

    # Insert roles
    for slug, name, description, is_system, priority in roles:
        conn.execute(
            text("""
            INSERT INTO roles (slug, name, description, is_system, priority, org_id)
            VALUES (:slug, :name, :description, :is_system, :priority, NULL)
            ON CONFLICT (slug, org_id) DO NOTHING
        """),
            {
                "slug": slug,
                "name": name,
                "description": description,
                "is_system": is_system,
                "priority": priority,
            },
        )

    # Get role IDs
    result = conn.execute(text("SELECT id, slug FROM roles WHERE org_id IS NULL"))
    role_ids = {row[1]: row[0] for row in result}

    # Get all permission IDs
    result = conn.execute(text("SELECT id, permission_key FROM permissions"))
    perm_ids = {row[1]: row[0] for row in result}

    # Define role-permission mappings
    role_permissions = {
        "admin": list(perm_ids.keys()),  # All permissions
        "maintainer": [
            p
            for p in perm_ids
            if any(
                x in p
                for x in [
                    "course:",
                    "chapter:",
                    "activity:",
                    "collection:",
                    "user:read",
                    "usergroup:read",
                    "analytics:read",
                ]
            )
        ],
        "instructor": [
            "course:create:org",
            "course:read:all",
            "course:update:own",
            "course:delete:own",
            "course:manage:own",
            "chapter:create:own",
            "chapter:read:all",
            "chapter:update:own",
            "chapter:delete:own",
            "activity:create:own",
            "activity:read:all",
            "activity:update:own",
            "activity:delete:own",
            "assignment:grade:own",
            "quiz:grade:own",
            "certificate:create:own",
            "analytics:read:own",
            "user:read:own",
        ],
        "moderator": ["course:read:all", "user:read:org", "discussion:moderate:org"],
        "user": [
            "course:read:all",
            "user:read:own",
            "user:update:own",
            "assignment:submit:all",
            "quiz:submit:all",
            "analytics:read:own",
            "collection:read:all",
            "certificate:read:all",
        ],
    }

    # Insert role-permission assignments
    for role_slug, permissions in role_permissions.items():
        role_id = role_ids.get(role_slug)
        if not role_id:
            continue

        for perm_key in permissions:
            perm_id = perm_ids.get(perm_key)
            if not perm_id:
                continue

            conn.execute(
                text("""
                INSERT INTO role_permissions (role_id, permission_id)
                VALUES (:role_id, :permission_id)
                ON CONFLICT (role_id, permission_id) DO NOTHING
            """),
                {"role_id": role_id, "permission_id": perm_id},
            )


def _migrate_user_organizations(conn) -> None:
    """Migrate existing user_organizations to user_roles (if userorganization table exists)."""
    try:
        # Check if userorganization table exists
        result = conn.execute(
            text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'userorganization'
            )
        """)
        )

        if not result.scalar():
            return

        # Map old role IDs to new role slugs
        old_role_mapping = {
            1: "admin",
            2: "maintainer",
            3: "instructor",
            4: "user",
        }

        # Get new role IDs by slug
        result = conn.execute(text("SELECT id, slug FROM roles WHERE org_id IS NULL"))
        new_role_ids = {row[1]: row[0] for row in result}

        # Migrate each user_organization entry
        result = conn.execute(
            text("SELECT user_id, org_id, role_id, creation_date FROM userorganization")
        )

        for row in result:
            user_id, org_id, old_role_id, creation_date = row
            new_role_slug = old_role_mapping.get(old_role_id, "user")
            new_role_id = new_role_ids.get(new_role_slug)

            if not new_role_id:
                continue

            conn.execute(
                text("""
                INSERT INTO user_roles (user_id, role_id, org_id, granted_at)
                VALUES (:user_id, :role_id, :org_id, :granted_at)
                ON CONFLICT (user_id, role_id, org_id) DO NOTHING
            """),
                {
                    "user_id": user_id,
                    "role_id": new_role_id,
                    "org_id": org_id,
                    "granted_at": creation_date or datetime.now(UTC),
                },
            )
    except Exception as e:
        print(f"   ⚠️  Warning during user_organizations migration: {e}")


def _migrate_userorganization_table(conn) -> None:
    """Migrate and drop the legacy userorganization table."""
    try:
        # Check if userorganization table exists
        result = conn.execute(
            text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'userorganization'
            )
        """)
        )

        if not result.scalar():
            return

        # Drop the legacy table
        conn.execute(text("DROP TABLE IF EXISTS userorganization CASCADE"))
        print("   ✅ Dropped legacy userorganization table")
    except Exception as e:
        print(f"   ⚠️  Warning: {e}")


def _add_creator_id_column(conn, table_name: str, fk_name: str) -> None:
    """Add creator_id column to a table."""
    try:
        # Check if column exists
        result = conn.execute(
            text(f"""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='{table_name}' AND column_name='creator_id'
        """)
        )

        if not result.fetchone():
            op.add_column(
                table_name, sa.Column("creator_id", sa.BigInteger(), nullable=True)
            )
            op.create_foreign_key(
                fk_name, table_name, "user", ["creator_id"], ["id"], ondelete="SET NULL"
            )
            print(f"   ✅ Added creator_id to {table_name}")
        else:
            print(f"   ℹ️  creator_id already exists in {table_name}")
    except Exception as e:
        print(f"   ⚠️  Warning adding creator_id to {table_name}: {e}")


def _cleanup_duplicate_users(conn) -> None:
    """Clean up duplicate users based on user_uuid."""
    try:
        # Find duplicate users
        result = conn.execute(
            text("""
            SELECT user_uuid, array_agg(id ORDER BY id) as ids
            FROM "user"
            WHERE user_uuid IS NOT NULL
            GROUP BY user_uuid
            HAVING COUNT(*) > 1
        """)
        )

        duplicates = result.fetchall()

        for _user_uuid, ids in duplicates:
            if not ids or len(ids) < 2:
                continue

            keep_id = ids[0]  # Keep the oldest (lowest ID)
            delete_ids = ids[1:]  # Delete the rest

            # Migrate foreign key references
            for delete_id in delete_ids:
                # Update user_roles
                conn.execute(
                    text("""
                    UPDATE user_roles
                    SET user_id = :keep_id
                    WHERE user_id = :delete_id
                    ON CONFLICT DO NOTHING
                """),
                    {"keep_id": keep_id, "delete_id": delete_id},
                )

                # Delete the duplicate user
                conn.execute(
                    text('DELETE FROM "user" WHERE id = :delete_id'),
                    {"delete_id": delete_id},
                )

        if duplicates:
            print(f"   ✅ Cleaned up {len(duplicates)} sets of duplicate users")
    except Exception as e:
        print(f"   ⚠️  Warning during duplicate cleanup: {e}")


def _add_user_unique_constraints(conn) -> None:
    """Add unique constraints to user table."""
    constraints = [
        ("uq_user_user_uuid", "user_uuid"),
        ("uq_user_email", "email"),
        ("uq_user_username", "username"),
    ]

    for constraint_name, column_name in constraints:
        try:
            # Check if constraint exists
            result = conn.execute(
                text(f"""
                SELECT constraint_name
                FROM information_schema.table_constraints
                WHERE table_name='user' AND constraint_name='{constraint_name}'
            """)
            )

            if not result.fetchone():
                op.create_unique_constraint(constraint_name, "user", [column_name])
                print(f"   ✅ Added {constraint_name}")
            else:
                print(f"   ℹ️  {constraint_name} already exists")
        except Exception as e:
            print(f"   ⚠️  Warning adding {constraint_name}: {e}")


def _create_additional_indexes(conn) -> None:
    """Create additional performance indexes."""
    indexes = [
        (
            "idx_resource_authors_resource_user",
            "resource_authors",
            ["resource_uuid", "user_id"],
            "authorship_status = 'ACTIVE'",
        ),
        ("idx_resource_authors_user_id", "resource_authors", ["user_id"], None),
    ]

    for index_name, table_name, columns, where_clause in indexes:
        try:
            # Check if table exists
            result = conn.execute(
                text(f"""
                SELECT EXISTS (
                    SELECT FROM pg_tables
                    WHERE schemaname = 'public' AND tablename = '{table_name}'
                )
            """)
            )

            if result.scalar():
                where_part = f"WHERE {where_clause}" if where_clause else ""
                columns_str = ", ".join(columns)
                conn.execute(
                    text(f"""
                    CREATE INDEX IF NOT EXISTS {index_name}
                    ON {table_name}({columns_str})
                    {where_part}
                """)
                )
                print(f"   ✅ Created {index_name}")
        except Exception as e:
            print(f"   ⚠️  Warning creating {index_name}: {e}")
