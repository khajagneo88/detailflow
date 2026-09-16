"""add app_settings

Revision ID: df9d787272e2
Revises: a1f3c9d2e6b7
Create Date: 2026-09-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'df9d787272e2'
down_revision: Union[str, None] = 'a1f3c9d2e6b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Mirrors app/models/app_settings.py::APP_SETTINGS_SINGLETON_ID — this
# table only ever holds one row.
_SINGLETON_ID = 1


def upgrade() -> None:
    # weekday is a brand new Postgres enum type, so — same note as
    # 972445d6ab00's notification_type — this doesn't need the
    # autocommit_block()/ALTER TYPE dance that adding a value to an
    # *existing* enum type requires.
    op.create_table('app_settings',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column(
        'planning_week_start_day',
        sa.Enum('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY', name='weekday'),
        nullable=False,
    ),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )

    # Seed the one singleton row directly here (rather than leaving it to
    # seed.py, which is dev-only) so a real deployment running `alembic
    # upgrade head` ends up with a working settings row immediately —
    # app/services/settings_service.py::get_or_create_settings is only a
    # defensive backstop, not the expected way this row comes into being.
    # Default of TUESDAY matches this shop's weekly planning meeting at the
    # time this table was added; change it any time from Settings (admin/
    # team leader only) with no migration required.
    app_settings = sa.table(
        'app_settings',
        sa.column('id', sa.Integer()),
        sa.column('planning_week_start_day', sa.String()),
    )
    op.bulk_insert(app_settings, [{'id': _SINGLETON_ID, 'planning_week_start_day': 'TUESDAY'}])


def downgrade() -> None:
    op.drop_table('app_settings')
    sa.Enum(name='weekday').drop(op.get_bind(), checkfirst=True)
