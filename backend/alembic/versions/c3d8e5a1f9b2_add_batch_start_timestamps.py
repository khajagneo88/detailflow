"""add batch start timestamps

Revision ID: c3d8e5a1f9b2
Revises: b7c2f4a9d1e3
Create Date: 2026-09-16 03:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d8e5a1f9b2'
down_revision: Union[str, None] = 'b7c2f4a9d1e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('batches', sa.Column('bom_started_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('batches', sa.Column('nesting_started_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('batches', 'nesting_started_at')
    op.drop_column('batches', 'bom_started_at')
