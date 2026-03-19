"""add teacher analytics rollups

Revision ID: f8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-03-08 10:15:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f8b9c0d1e2f3"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _table_exists(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _index_exists(inspector: sa.Inspector, table_name: str, index_name: str) -> bool:
    if not _table_exists(inspector, table_name):
        return False
    return any(
        index.get("name") == index_name for index in inspector.get_indexes(table_name)
    )


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _table_exists(inspector, "analytics_event"):
        op.create_table(
            "analytics_event",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("event_type", sa.String(length=100), nullable=False),
            sa.Column("org_id", sa.BigInteger(), nullable=False),
            sa.Column("course_id", sa.BigInteger(), nullable=True),
            sa.Column("chapter_id", sa.BigInteger(), nullable=True),
            sa.Column("activity_id", sa.BigInteger(), nullable=True),
            sa.Column("assessment_type", sa.String(length=32), nullable=True),
            sa.Column("assessment_id", sa.BigInteger(), nullable=True),
            sa.Column("user_id", sa.BigInteger(), nullable=True),
            sa.Column("teacher_user_id", sa.BigInteger(), nullable=True),
            sa.Column("cohort_id", sa.BigInteger(), nullable=True),
            sa.Column("event_ts", sa.DateTime(timezone=True), nullable=False),
            sa.Column("event_date", sa.Date(), nullable=False),
            sa.Column(
                "payload",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("now()"),
            ),
        )
        inspector = sa.inspect(bind)

    if not _index_exists(inspector, "analytics_event", "ix_analytics_event_org_date"):
        op.create_index(
            "ix_analytics_event_org_date",
            "analytics_event",
            ["org_id", "event_date"],
            unique=False,
        )
        inspector = sa.inspect(bind)
    if not _index_exists(
        inspector, "analytics_event", "ix_analytics_event_course_date"
    ):
        op.create_index(
            "ix_analytics_event_course_date",
            "analytics_event",
            ["course_id", "event_date"],
            unique=False,
        )
        inspector = sa.inspect(bind)
    if not _index_exists(inspector, "analytics_event", "ix_analytics_event_user_date"):
        op.create_index(
            "ix_analytics_event_user_date",
            "analytics_event",
            ["user_id", "event_date"],
            unique=False,
        )
        inspector = sa.inspect(bind)
    if not _index_exists(inspector, "analytics_event", "ix_analytics_event_type_date"):
        op.create_index(
            "ix_analytics_event_type_date",
            "analytics_event",
            ["event_type", "event_date"],
            unique=False,
        )
        inspector = sa.inspect(bind)

    if not _table_exists(inspector, "daily_teacher_metrics"):
        op.create_table(
            "daily_teacher_metrics",
            sa.Column("metric_date", sa.Date(), nullable=False),
            sa.Column("org_id", sa.BigInteger(), nullable=False),
            sa.Column("teacher_user_id", sa.BigInteger(), nullable=False),
            sa.Column(
                "managed_course_count", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column(
                "active_learners_7d", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column(
                "active_learners_28d", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column(
                "returning_learners_28d",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
            sa.Column("completion_rate", sa.Numeric(5, 2), nullable=True),
            sa.Column("avg_progress_pct", sa.Numeric(5, 2), nullable=True),
            sa.Column(
                "at_risk_learners", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column(
                "ungraded_submissions", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column(
                "courses_with_negative_engagement",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
            sa.Column(
                "certificates_issued_28d",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
            sa.Column(
                "generated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("now()"),
            ),
            sa.PrimaryKeyConstraint("metric_date", "org_id", "teacher_user_id"),
        )
        inspector = sa.inspect(bind)

    if not _table_exists(inspector, "daily_course_metrics"):
        op.create_table(
            "daily_course_metrics",
            sa.Column("metric_date", sa.Date(), nullable=False),
            sa.Column("org_id", sa.BigInteger(), nullable=False),
            sa.Column("course_id", sa.BigInteger(), nullable=False),
            sa.Column("teacher_user_id", sa.BigInteger(), nullable=True),
            sa.Column(
                "enrolled_learners", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column(
                "active_learners_7d", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column(
                "active_learners_28d", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column("completion_rate", sa.Numeric(5, 2), nullable=True),
            sa.Column("avg_progress_pct", sa.Numeric(5, 2), nullable=True),
            sa.Column(
                "at_risk_learners", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column(
                "ungraded_submissions", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column(
                "certificates_issued", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column("content_health_score", sa.Numeric(5, 2), nullable=True),
            sa.Column("engagement_delta_pct", sa.Numeric(6, 2), nullable=True),
            sa.Column(
                "last_content_update_at", sa.DateTime(timezone=True), nullable=True
            ),
            sa.Column(
                "generated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("now()"),
            ),
            sa.PrimaryKeyConstraint("metric_date", "org_id", "course_id"),
        )
        inspector = sa.inspect(bind)

    if not _table_exists(inspector, "daily_course_engagement"):
        op.create_table(
            "daily_course_engagement",
            sa.Column("metric_date", sa.Date(), nullable=False),
            sa.Column("course_id", sa.BigInteger(), nullable=False),
            sa.Column("chapter_id", sa.BigInteger(), nullable=True),
            sa.Column("activity_id", sa.BigInteger(), nullable=True),
            sa.Column("org_id", sa.BigInteger(), nullable=False),
            sa.Column("step_order", sa.Integer(), nullable=True),
            sa.Column(
                "started_learners", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column(
                "completed_learners", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column("dropoff_from_previous_pct", sa.Numeric(6, 2), nullable=True),
            sa.Column(
                "generated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("now()"),
            ),
            sa.PrimaryKeyConstraint(
                "metric_date", "course_id", "chapter_id", "activity_id"
            ),
        )
        inspector = sa.inspect(bind)

    if not _table_exists(inspector, "daily_assessment_metrics"):
        op.create_table(
            "daily_assessment_metrics",
            sa.Column("metric_date", sa.Date(), nullable=False),
            sa.Column("assessment_type", sa.String(length=32), nullable=False),
            sa.Column("assessment_id", sa.BigInteger(), nullable=False),
            sa.Column("org_id", sa.BigInteger(), nullable=False),
            sa.Column("course_id", sa.BigInteger(), nullable=False),
            sa.Column("activity_id", sa.BigInteger(), nullable=True),
            sa.Column(
                "eligible_learners", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column(
                "submitted_learners", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column("submission_rate", sa.Numeric(5, 2), nullable=True),
            sa.Column("completion_rate", sa.Numeric(5, 2), nullable=True),
            sa.Column("pass_rate", sa.Numeric(5, 2), nullable=True),
            sa.Column("median_score", sa.Numeric(6, 2), nullable=True),
            sa.Column("avg_score", sa.Numeric(6, 2), nullable=True),
            sa.Column("avg_attempts", sa.Numeric(6, 2), nullable=True),
            sa.Column("grading_latency_hours_p50", sa.Numeric(8, 2), nullable=True),
            sa.Column("grading_latency_hours_p90", sa.Numeric(8, 2), nullable=True),
            sa.Column("difficulty_score", sa.Numeric(6, 2), nullable=True),
            sa.Column(
                "generated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("now()"),
            ),
            sa.PrimaryKeyConstraint("metric_date", "assessment_type", "assessment_id"),
        )
        inspector = sa.inspect(bind)

    if not _table_exists(inspector, "daily_user_course_progress"):
        op.create_table(
            "daily_user_course_progress",
            sa.Column("metric_date", sa.Date(), nullable=False),
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column("course_id", sa.BigInteger(), nullable=False),
            sa.Column("org_id", sa.BigInteger(), nullable=False),
            sa.Column("trailrun_id", sa.BigInteger(), nullable=True),
            sa.Column(
                "progress_pct", sa.Numeric(5, 2), nullable=False, server_default="0"
            ),
            sa.Column(
                "completed_steps", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column("total_steps", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "is_completed",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
            sa.Column(
                "has_certificate",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
            sa.Column(
                "generated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("now()"),
            ),
            sa.PrimaryKeyConstraint("metric_date", "user_id", "course_id"),
        )
        inspector = sa.inspect(bind)

    if not _table_exists(inspector, "learner_risk_snapshot"):
        op.create_table(
            "learner_risk_snapshot",
            sa.Column("snapshot_date", sa.Date(), nullable=False),
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column("course_id", sa.BigInteger(), nullable=False),
            sa.Column("org_id", sa.BigInteger(), nullable=False),
            sa.Column("teacher_user_id", sa.BigInteger(), nullable=True),
            sa.Column(
                "progress_pct", sa.Numeric(5, 2), nullable=False, server_default="0"
            ),
            sa.Column("days_since_last_activity", sa.Integer(), nullable=True),
            sa.Column(
                "failed_assessments", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column(
                "missing_required_assessments",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
            sa.Column(
                "open_grading_blocks", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column(
                "risk_score", sa.Numeric(6, 2), nullable=False, server_default="0"
            ),
            sa.Column("risk_level", sa.String(length=16), nullable=False),
            sa.Column(
                "reason_codes",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'[]'::jsonb"),
            ),
            sa.Column("recommended_action", sa.String(length=255), nullable=True),
            sa.Column(
                "generated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("now()"),
            ),
            sa.PrimaryKeyConstraint("snapshot_date", "user_id", "course_id"),
        )


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS learner_risk_snapshot"))
    op.execute(sa.text("DROP TABLE IF EXISTS daily_user_course_progress"))
    op.execute(sa.text("DROP TABLE IF EXISTS daily_assessment_metrics"))
    op.execute(sa.text("DROP TABLE IF EXISTS daily_course_engagement"))
    op.execute(sa.text("DROP TABLE IF EXISTS daily_course_metrics"))
    op.execute(sa.text("DROP TABLE IF EXISTS daily_teacher_metrics"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_analytics_event_type_date"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_analytics_event_user_date"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_analytics_event_course_date"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_analytics_event_org_date"))
    op.execute(sa.text("DROP TABLE IF EXISTS analytics_event"))
