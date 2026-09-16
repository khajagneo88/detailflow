"""simplify workflow stages: drop pre-IFA modelling stages

Revision ID: a1f3c9d2e6b7
Revises: 7c527eb18338
Create Date: 2026-09-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1f3c9d2e6b7'
down_revision: Union[str, None] = '7c527eb18338'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The four solitary pre-drafting stages being dropped — a literal product-
# owner ask to reduce the room pipeline down to just the client-facing IFA/
# IFC cycle (see app/models/workflow_stage.py's DEFAULT_WORKFLOW_STAGES for
# the full reasoning). A room now starts life directly in IFA Drafted the
# moment a detailer clicks Start. Revision stages are untouched.
_REMOVED_KEYS = ("setup", "modelling_3d", "waiting_check_measure", "final_detailing")

# The 9 stages that remain, renumbered to a contiguous sequence in pipeline
# order — must match DEFAULT_WORKFLOW_STAGES in app/models/workflow_stage.py.
_NEW_SEQUENCE = {
    "ifa_drafted": 1,
    "ifa_internal_review": 2,
    "ifa_issued": 3,
    "ifa_revision": 4,
    "ifc_drafted": 5,
    "ifc_internal_review": 6,
    "ifc_issued": 7,
    "ifc_revision": 8,
    "complete": 9,
}

_workflow_stages = sa.table(
    "workflow_stages",
    sa.column("id", sa.Integer),
    sa.column("key", sa.String),
    sa.column("sequence", sa.Integer),
)
_rooms = sa.table(
    "rooms",
    sa.column("id", sa.Integer),
    sa.column("workflow_stage_id", sa.Integer),
    sa.column("progress", sa.Integer),
)
_room_stage_events = sa.table(
    "room_stage_events",
    sa.column("id", sa.Integer),
    sa.column("from_stage_id", sa.Integer),
    sa.column("to_stage_id", sa.Integer),
)


def upgrade() -> None:
    conn = op.get_bind()

    id_by_key = {
        row.key: row.id
        for row in conn.execute(sa.select(_workflow_stages.c.id, _workflow_stages.c.key))
    }

    # Nothing to remap on a database whose workflow_stages table hasn't
    # been seeded yet (e.g. a brand-new install running migrations before
    # seed.py ever runs — workflow_stages has never been populated by a
    # migration that INSERTs rows, only by seed.py, see workflow_stage.py).
    if "ifa_drafted" not in id_by_key:
        return

    ifa_drafted_id = id_by_key["ifa_drafted"]
    removed_ids = [id_by_key[k] for k in _REMOVED_KEYS if k in id_by_key]

    if removed_ids:
        # Any room still sitting in one of the four removed pre-drafting
        # stages moves straight into IFA Drafted — the new first stage —
        # rather than being left pointing at a row we're about to delete.
        conn.execute(
            _rooms.update()
            .where(_rooms.c.workflow_stage_id.in_(removed_ids))
            .values(workflow_stage_id=ifa_drafted_id)
        )

        # RoomStageEvent is an append-only audit log (docs/ARCHITECTURE.md
        # §15) — rows referencing a removed stage are repointed at IFA
        # Drafted rather than deleted, and have to be repointed before the
        # old stage rows can be dropped at all: both from_stage_id and
        # to_stage_id are RESTRICT FKs onto workflow_stages.
        conn.execute(
            _room_stage_events.update()
            .where(_room_stage_events.c.from_stage_id.in_(removed_ids))
            .values(from_stage_id=ifa_drafted_id)
        )
        conn.execute(
            _room_stage_events.update()
            .where(_room_stage_events.c.to_stage_id.in_(removed_ids))
            .values(to_stage_id=ifa_drafted_id)
        )

        conn.execute(_workflow_stages.delete().where(_workflow_stages.c.id.in_(removed_ids)))

    # Renumber the remaining 9 stages to a contiguous 1..9 in pipeline
    # order. Two passes (offset out of range, then the real value) so the
    # `sequence` UNIQUE constraint is never violated regardless of what the
    # stages' current sequence values happen to be.
    for key, seq in _NEW_SEQUENCE.items():
        if key not in id_by_key:
            continue
        conn.execute(
            _workflow_stages.update()
            .where(_workflow_stages.c.id == id_by_key[key])
            .values(sequence=seq + 1000)
        )
    for key, seq in _NEW_SEQUENCE.items():
        if key not in id_by_key:
            continue
        conn.execute(
            _workflow_stages.update()
            .where(_workflow_stages.c.id == id_by_key[key])
            .values(sequence=seq)
        )

    # Recompute every room's progress against the new 9-stage total (the
    # old percentages were computed as sequence / 13 — stale now for every
    # room, not just the ones just remapped onto IFA Drafted). Mirrors
    # app/services/room_service.py::compute_progress.
    total_stages = len(_NEW_SEQUENCE)
    new_seq_by_stage_id = {
        id_by_key[key]: seq for key, seq in _NEW_SEQUENCE.items() if key in id_by_key
    }
    for stage_id, seq in new_seq_by_stage_id.items():
        conn.execute(
            _rooms.update()
            .where(_rooms.c.workflow_stage_id == stage_id)
            .values(progress=round((seq / total_stages) * 100))
        )


def downgrade() -> None:
    # Not meaningfully reversible — the four removed stage rows are gone,
    # and there's no way to know which rooms/events used to point at which
    # of them (folded into IFA Drafted above). Same no-op precedent as
    # 7c527eb18338's plan_entries replacement for a data-shape migration
    # with no way to faithfully restore what was removed.
    pass
