from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base

# Fixed MVP stage order — seeded once by seed.py / the initial migration data.
# Stored as rows (not a Python enum on the room table) specifically so a
# future "configurable workflow" feature can add/reorder/rename stages
# without a schema change. See docs/ARCHITECTURE.md §8.
#
# Stages 1-4 are the modelling stages a detailer works through alone.
#
# Stages 5-12 are the review/approval cycle, reshaped (as of the IFA/IFC
# production-pipeline work) into two explicit named cycles instead of one
# generic pass: IFA (Issued For Approval — the client-facing shop-drawing
# package) and IFC (Issued For Construction — the package that's actually
# built from), each with its own Team Leader internal-review gate and its
# own revision loop-back. This replaced the previous single-pass list
# (Initial Review -> Issued for Approval -> Internal Review -> Drawings
# Submitted -> Revision/Issued for Construction) — that list's stages map
# onto this one as: Initial Review + Issued for Approval -> IFA Drafted,
# Internal Review -> IFA Internal Review, Drawings Submitted -> IFA Issued
# (still the "outcome" decision point — see below), Revision -> IFA
# Revision, and the old Issued for Construction stage no longer exists as
# its own resting stage: the IFC cycle (IFC Drafted -> IFC Internal Review
# -> IFC Issued) now carries that meaning, advancing straight to Complete
# unless a revision is needed.
#
# Only IFA Issued carries a *required* client-approval gate (the
# `StageTransitionOutcome` recorded on the RoomStageEvent when leaving this
# stage — approved/approved_with_comments moves the room on to IFC Drafted,
# markups_required moves it to IFA Revision) — this is the same mechanism
# the old Drawings Submitted stage used, just retargeted. IFC Issued
# deliberately does *not* require an outcome to proceed to Complete: client
# involvement on an issued-for-construction package is optional/rare in
# this team's process (a later "Variation" feature may still record an
# outcome here when a client does request a late change, looping back to
# IFC Revision — see room_service.transition_room_stage, which reads
# to_stage.key generically rather than hardcoding "only IFA/IFC can loop
# back", so that isn't blocked by anything here).
#
# A revision only resets the room to redrafting that specific package —
# IFA Revision -> IFA Drafted, IFC Revision -> IFC Drafted — never back to
# Final Detailing, matching how the single old Revision stage only ever
# looped back to Drawings Submitted (never to Final Detailing) rather than
# forcing the room to redo its 3D modelling.
#
# BOM, Nesting and Batch-level stages are deliberately NOT in this list —
# per docs/ARCHITECTURE.md, those are being modelled as a separate
# per-Batch entity in a later task, not as per-room workflow stages.
# Reintroducing/adding any future stage here remains a pure data change
# (this list + a re-seed) plus wiring, not a schema change, because stages
# are rows in a lookup table, not an enum (§8).
#
# NOTE on how this data actually gets into the database: workflow_stages
# has never been populated by an Alembic migration in this codebase (see
# the initial-schema migration, which creates the *table* but inserts no
# rows) — it's seeded/re-seeded exclusively by seed.py, and the stage
# picker/re-seed pattern documented in §11.6/§18 assumes that. Rooms
# reference stages by FK id, so simply changing this list and re-running
# seed.py is destructive to any *real* (non-seed) room data pointing at
# the old stage ids — acceptable here because this codebase has no
# production data yet and seed.py already unconditionally clears and
# recreates rooms/stages on every run (see seed.py's own comments). A
# production rollout of this change would instead need a data migration
# that inserts the new stage rows, remaps existing rooms' workflow_stage_id
# from each old key to its new equivalent per the mapping above, and only
# then removes the old rows — deliberately not attempted here since there's
# nothing yet to migrate.
DEFAULT_WORKFLOW_STAGES: list[dict] = [
    {"key": "setup", "name": "Setup", "sequence": 1},
    {"key": "modelling_3d", "name": "3D Modelling", "sequence": 2},
    {"key": "waiting_check_measure", "name": "Waiting for Check Measure", "sequence": 3},
    {"key": "final_detailing", "name": "Final Detailing", "sequence": 4},
    {"key": "ifa_drafted", "name": "IFA Drafted", "sequence": 5},
    {"key": "ifa_internal_review", "name": "IFA Internal Review", "sequence": 6},
    {"key": "ifa_issued", "name": "IFA Issued", "sequence": 7},
    {"key": "ifa_revision", "name": "IFA Revision", "sequence": 8},
    {"key": "ifc_drafted", "name": "IFC Drafted", "sequence": 9},
    {"key": "ifc_internal_review", "name": "IFC Internal Review", "sequence": 10},
    {"key": "ifc_issued", "name": "IFC Issued", "sequence": 11},
    {"key": "ifc_revision", "name": "IFC Revision", "sequence": 12},
    {"key": "complete", "name": "Complete", "sequence": 13},
]


class WorkflowStage(Base):
    __tablename__ = "workflow_stages"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<WorkflowStage {self.key}>"
