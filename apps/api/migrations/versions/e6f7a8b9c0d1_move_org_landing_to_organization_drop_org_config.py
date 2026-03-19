"""Move org landing to organization and drop legacy org config table.

Revision ID: e6f7a8b9c0d1
Revises: c9d0e1f2a3b4
Create Date: 2026-03-08 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "e6f7a8b9c0d1"
down_revision: str | None = "c9d0e1f2a3b4"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    organization_columns = {
        column["name"] for column in inspector.get_columns("organization")
    }
    if "landing" not in organization_columns:
        op.add_column(
            "organization",
            sa.Column(
                "landing",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
        )

    if inspector.has_table("organization_config"):
        op.execute(
            """
            UPDATE organization AS org
            SET landing = COALESCE(cfg.config->'landing', '{}'::jsonb)
            FROM organization_config AS cfg
            WHERE cfg.org_id = org.id
            """
        )
        op.drop_table("organization_config")

    op.execute("UPDATE organization SET landing = COALESCE(landing, '{}'::jsonb)")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("organization_config"):
        op.create_table(
            "organization_config",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column(
                "org_id",
                sa.BigInteger(),
                sa.ForeignKey("organization.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "config",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column("creation_date", sa.String(), nullable=True),
            sa.Column("update_date", sa.String(), nullable=True),
        )

    op.execute(
        """
        INSERT INTO organization_config (org_id, config, creation_date, update_date)
        SELECT
            org.id,
            jsonb_build_object(
                'config_version', '1.3',
                'general', jsonb_build_object('enabled', true, 'color', 'normal'),
                'features', jsonb_build_object(
                    'courses', jsonb_build_object('enabled', true, 'limit', 10),
                    'members', jsonb_build_object('enabled', true, 'admin_limit', 1, 'limit', 10),
                    'usergroups', jsonb_build_object('enabled', true, 'limit', 10),
                    'storage', jsonb_build_object('enabled', true, 'limit', 10),
                    'ai', jsonb_build_object(
                        'enabled', true,
                        'limit', 10,
                        'model', 'gpt-5.4-nano',
                        'streaming_enabled', true,
                        'response_cache_enabled', true,
                        'semantic_cache_enabled', true,
                        'max_tokens_per_request', 4000,
                        'max_chat_history', 100,
                        'rate_limit_per_user', 100
                    ),
                    'assignments', jsonb_build_object('enabled', true, 'limit', 10),
                    'exams', jsonb_build_object('enabled', true, 'limit', 10),
                    'payments', jsonb_build_object('enabled', true),
                    'discussions', jsonb_build_object('enabled', true, 'limit', 10),
                    'analytics', jsonb_build_object('enabled', true, 'limit', 10),
                    'collaboration', jsonb_build_object('enabled', true, 'limit', 10),
                    'api', jsonb_build_object('enabled', true, 'limit', 10)
                ),
                'cloud', jsonb_build_object('plan', 'free', 'custom_domain', false),
                'landing', COALESCE(org.landing, '{}'::jsonb)
            ),
            org.creation_date,
            org.update_date
        FROM organization AS org
        """
    )

    if "landing" in {
        column["name"] for column in inspector.get_columns("organization")
    }:
        op.drop_column("organization", "landing")
