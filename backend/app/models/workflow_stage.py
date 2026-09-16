from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base

# Fixed MVP stage order — seeded once by seed.py / the initial migration data.
# Stored as rows (not a Python enum on the room table) specifically so a
# future "configurable workflow" feature can add/reorder/rename stages
# without a schema change. See docs/ARCHITECTURE.md §8.
#
# Simplified (§24) from the original 13-stage list down to just the 9
# client-facing pipeline stages — a literal product-owner ask to "reduce
# the steps": a room now starts life directly in IFA Drafted the moment a
# detailer clicks Start, with no solitary pre-drafting stages (the old
# Setup / 3D Modelling / Waiting for Check Measure / Final Detailing) in
# front of it. Any room that was sitting in one of those four when this
# shipped was migrated forward into IFA Drafted — see the Alembic
# migration that accompanies this change (named for "simplify workflow
# stages") — rather than left pointing at a stage row that no longer
# exists.
#
# Stages 1-8 are the review/approval cycle: IFA (Issued For Approval — the
# client-facing shop-drawing package) and IFC (Issued For Construction —
# the package that's actually built from), each with its own Team Leader
# internal-review gate and its own revision loop-back.
#
# Only IFA Issued carries a *required* client-approval gate (the
# `StageTransitionOutcome` recorded on the RoomStageEvent when leaving this
# stage — approved/approved_with_comments moves the room on to IFC Drafted,
# markups_required moves it to IFA Revision). IFC Issued deliberately does
# *not* require an outcome to proceed to Complete: client involvement on an
# issued-for-construction package is optional/rare in this team's process
# (a Variation may still record an outcome here when a client does request
# a late change, looping back to IFC Revision — see
# room_service.transition_room_stage, which reads to_stage.key generically
# rather than hardcoding "only IFA/IFC can loop back", so that isn't
# blocked by anything here). Once a room reaches IFC Issued it's eligible
# to join a Batch (app/services/batch_service.py), whose own bom_pending ->
# bom_review -> nesting -> complete lifecycle *is* "the BOM and Nesting"
# the product owner asked to show next to a room's name — see
# frontend/lib/plan-colors.ts::roomCategory, which reads a room's Batch
# status once it's batched instead of its own (now-frozen-at-ifc_issued)
# workflow stage.
#
# A revision only resets the room to redrafting that specific package —
# IFA Revision -> IFA Drafted, IFC Revision -> IFC Drafted.
#
# BOM, Nesting and Batch-level stages are deliberately NOT in this list —
# per docs/ARCHITECTURE.md, those are modelled as a separate per-Batch
# entity, not as per-room workflow stages. Reintroducing/adding any future
# stage here remains a pure data change (this list + a migration/re-seed)
# plus wiring, not a schema change, because stages are rows in a lookup
# table, not an enum (§8).
#
# NOTE on how this data actually gets into the database: workflow_stages
# has never been populated by an Alembic migration that INSERTS rows in
# this codebase (see the initial-schema migration, which creates the
# *table* but inserts no rows) — it's seeded exclusively by seed.py. The
# §24 migration is the first migration to touch this table's *contents* at
# all, and it does so surgically (remap + delete + renumber) specifically
# because, unlike every previous stage-list change, this one had to assume
# real (non-seed) rooms might already be pointing at the stages being
# removed.
DEFAULT_WORKFLOW_STAGES: list[dict] = [
    {"key": "ifa_drafted", "name": "IFA Drafted", "sequence": 1},
    {"key": "ifa_internal_review", "name": "IFA Internal Review", "sequence": 2},
    {"key": "ifa_issued", "name": "IFA Issued", "sequence": 3},
    {"key": "ifa_revision", "name": "IFA Revision", "sequence": 4},
    {"key": "ifc_drafted", "name": "IFC Drafted", "sequence": 5},
    {"key": "ifc_internal_review", "name": "IFC Internal Review", "sequence": 6},
    {"key": "ifc_issued", "name": "IFC Issued", "sequence": 7},
    {"key": "ifc_revision", "name": "IFC Revision", "sequence": 8},
    {"key": "complete", "name": "Complete", "sequence": 9},
]


class WorkflowStage(Base):
    __tablename__ = "workflow_stages"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<WorkflowStage {self.key}>"
