"""replace weekly_plan_entries with day-level plan_entries

Revision ID: 7c527eb18338
Revises: 972445d6ab00
Create Date: 2026-09-15 06:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7c527eb18338'
down_revision: Union[str, None] = '972445d6ab00'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # weekly_plan_entries (project + user + week_start) is replaced wholesale
    # by plan_entries (user + date + room-or-batch) — this is a schema
    # replacement, not an evolution, so the old table is dropped outright
    # rather than migrated row-by-row: a week-level "John was on Richmond
    # this week" forecast has no faithful mapping onto a day-level "John is
    # planned on this specific room/batch today" grid, and there is no
    # production data to preserve (see docs/ARCHITECTURE.md).
    op.drop_index('ix_weekly_plan_entries_week_start', table_name='weekly_plan_entries')
    op.drop_index('ix_weekly_plan_entries_user_id', table_name='weekly_plan_entries')
    op.drop_index('ix_weekly_plan_entries_project_id', table_name='weekly_plan_entries')
    op.drop_table('weekly_plan_entries')

    # plan_entries: no new Postgres enum types here (room_id/batch_id are
    # plain nullable FKs, not enum columns), so none of the
    # autocommit_block()/ALTER TYPE dance from docs/ARCHITECTURE.md §11.5
    # applies — this is a plain new table, same as 79e1794040f1 (add_batches).
    op.create_table(
        'plan_entries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('room_id', sa.Integer(), nullable=True),
        sa.Column('batch_id', sa.Integer(), nullable=True),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint(
            '(room_id IS NOT NULL AND batch_id IS NULL) OR (room_id IS NULL AND batch_id IS NOT NULL)',
            name='ck_plan_entry_room_xor_batch',
        ),
        sa.ForeignKeyConstraint(['batch_id'], ['batches.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['room_id'], ['rooms.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('room_id', 'date', name='uq_plan_entry_room_date'),
        sa.UniqueConstraint('batch_id', 'date', name='uq_plan_entry_batch_date'),
    )
    op.create_index(op.f('ix_plan_entries_user_id'), 'plan_entries', ['user_id'], unique=False)
    op.create_index(op.f('ix_plan_entries_date'), 'plan_entries', ['date'], unique=False)
    op.create_index(op.f('ix_plan_entries_room_id'), 'plan_entries', ['room_id'], unique=False)
    op.create_index(op.f('ix_plan_entries_batch_id'), 'plan_entries', ['batch_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_plan_entries_batch_id'), table_name='plan_entries')
    op.drop_index(op.f('ix_plan_entries_room_id'), table_name='plan_entries')
    op.drop_index(op.f('ix_plan_entries_date'), table_name='plan_entries')
    op.drop_index(op.f('ix_plan_entries_user_id'), table_name='plan_entries')
    op.drop_table('plan_entries')

    op.create_table(
        'weekly_plan_entries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('week_start', sa.Date(), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('project_id', 'user_id', 'week_start', name='uq_weekly_plan_entry'),
    )
    op.create_index(op.f('ix_weekly_plan_entries_project_id'), 'weekly_plan_entries', ['project_id'], unique=False)
    op.create_index(op.f('ix_weekly_plan_entries_user_id'), 'weekly_plan_entries', ['user_id'], unique=False)
    op.create_index(op.f('ix_weekly_plan_entries_week_start'), 'weekly_plan_entries', ['week_start'], unique=False)
