"""add review-requested notification types

Revision ID: b7c2f4a9d1e3
Revises: df9d787272e2
Create Date: 2026-09-16 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7c2f4a9d1e3'
down_revision: Union[str, None] = 'df9d787272e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Adding a value to an existing native Postgres enum can't run inside the
    # same transaction as other DDL, and Alembic autogenerate does not detect
    # enum-value additions at all — same note as 8ffac8920633 (which added
    # VARIATION to comment_type the same way). The value is the enum
    # member's *name* (uppercase), matching what's actually stored in the
    # notifications.type column — see docs/ARCHITECTURE.md §11.5. The API
    # still returns "ifa_review_requested"/"ifc_review_requested" (Pydantic
    # serialises .value); this only affects the raw column contents.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'IFA_REVIEW_REQUESTED'")
        op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'IFC_REVIEW_REQUESTED'")


def downgrade() -> None:
    # Postgres has no "DROP VALUE" for enums — same documented limitation as
    # every other enum-value-addition migration in this codebase (8ffac8920633,
    # 68428e0795c7, 15f014898eea). Not attempted here; do it manually and
    # confirm no notification row uses either value first if a downgrade is
    # ever actually needed.
    pass
