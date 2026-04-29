"""Add canonical anti-cheat JSON to assessment policy.

Revision ID: c3d4e5f6g7h8
Revises: b2c3d4e5f6g7
Create Date: 2026-04-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c3d4e5f6g7h8"
down_revision: str | None = "b2c3d4e5f6g7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "assessment_policy",
        sa.Column(
            "anti_cheat_json",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::json"),
        ),
    )

    op.execute("""
        UPDATE assessment_policy
        SET anti_cheat_json = json_build_object(
            'copy_paste_protection', COALESCE((exam.settings ->> 'copy_paste_protection')::boolean, false),
            'tab_switch_detection', COALESCE((exam.settings ->> 'tab_switch_detection')::boolean, false),
            'devtools_detection', COALESCE((exam.settings ->> 'devtools_detection')::boolean, false),
            'right_click_disable', COALESCE((exam.settings ->> 'right_click_disable')::boolean, false),
            'fullscreen_enforcement', COALESCE((exam.settings ->> 'fullscreen_enforcement')::boolean, false),
            'violation_threshold',
                CASE
                    WHEN (exam.settings ->> 'violation_threshold') ~ '^[0-9]+$'
                        THEN (exam.settings ->> 'violation_threshold')::int
                    ELSE NULL
                END
        )
        FROM exam
        WHERE assessment_policy.activity_id = exam.activity_id
          AND assessment_policy.assessment_type = 'EXAM'
    """)

    op.execute("""
        UPDATE assignment_task
        SET contents = jsonb_set(
            contents::jsonb,
            '{settings}',
            (
                (COALESCE(contents::jsonb -> 'settings', '{}'::jsonb))
                - 'prevent_copy'
                - 'track_violations'
                - 'max_violations'
                - 'block_on_violations'
            )
        )::json
        WHERE assignment_type = 'QUIZ'
          AND contents IS NOT NULL
          AND contents::jsonb ? 'settings'
    """)


def downgrade() -> None:
    op.drop_column("assessment_policy", "anti_cheat_json")
