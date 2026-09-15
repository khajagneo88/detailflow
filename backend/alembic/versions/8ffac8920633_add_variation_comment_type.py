"""add variation comment type

Revision ID: 8ffac8920633
Revises: 15f014898eea
Create Date: 2026-09-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8ffac8920633'
down_revision: Union[str, None] = '15f014898eea'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Adding a value to an existing native Postgres enum can't run inside the
    # same transaction as other DDL, and Alembic autogenerate does not detect
    # enum-value additions at all — both called out in
    # alembic/versions/68428e0795c7_add_manager_role_room_stage_events_.py
    # (which added Manager to user_role the same way) and repeated in
    # alembic/versions/15f014898eea_add_nester_and_project_manager_roles_.py.
    # The value is the enum member's *name* (uppercase), matching what's
    # actually stored in the comment_type column — SQLAlchemy's Enum type
    # stores a Python enum member's .name by default, not its .value — see
    # docs/ARCHITECTURE.md §11.5. The API still returns "variation"
    # (Pydantic serialises .value); this only affects the raw column
    # contents.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE comment_type ADD VALUE IF NOT EXISTS 'VARIATION'")


def downgrade() -> None:
    # Postgres has no "DROP VALUE" for enums — removing 'VARIATION' from
    # comment_type would require rebuilding the type. Not attempted here,
    # same as the Manager-role and PROJECT_MANAGER/NESTER downgrade notes in
    # 68428e0795c7 and 15f014898eea; do it manually and confirm no comment
    # row uses this value first if a downgrade is ever actually needed.
    pass
