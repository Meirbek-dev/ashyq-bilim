"""add TYPE_QUIZ to activitytypeenum

Revision ID: 977d3e32c36a
Revises: d9a1c7e5b402
Create Date: 2026-05-13 12:08:35.591510

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '977d3e32c36a'
down_revision: Union[str, None] = 'd9a1c7e5b402'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE activitytypeenum ADD VALUE 'TYPE_QUIZ'")


def downgrade() -> None:
    pass
