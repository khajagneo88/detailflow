from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base

# Fixed MVP stage order — seeded once by seed.py / the initial migration data.
# Stored as rows (not a Python enum on the room table) specifically so a
# future "configurable workflow" feature can add/reorder/rename stages
# without a schema change. See docs/ARCHITECTURE.md §8.
#
# Stages 1-4 are the modelling stages a detailer works through alone.
# Stages 5-9 are the review/approval cycle (revised from the original
# Team Leader Check/Corrections/Approved/BOM/Nesting/Drawings & Reports/
# Ready for Production list to match the team's actual shop-drawing
# submission process): a room is checked internally (Initial Review),
# issued to the team leader/manager for sign-off (Issued for Approval),
# reviewed by them (Internal Review), then the drawings are actually
# submitted externally (Drawings Submitted). What comes back either
# approves the room — moving it to Issued for Construction — or comes
# back with markups, moving it to Revision, from which it re-enters
# Drawings Submitted once fixed. See docs/ARCHITECTURE.md for the full
# reasoning and the room_stage_events table that records each of these
# transitions (with an outcome + note) rather than overwriting history.
#
# BOM and Nesting tracking are dropped from this fixed list for now —
# they were always a future-roadmap item (never built), and reintroducing
# them as their own stage(s) once that module exists is a pure data change
# here plus a re-seed, not a schema change.
DEFAULT_WORKFLOW_STAGES: list[dict] = [
    {"key": "setup", "name": "Setup", "sequence": 1},
    {"key": "modelling_3d", "name": "3D Modelling", "sequence": 2},
    {"key": "waiting_check_measure", "name": "Waiting for Check Measure", "sequence": 3},
    {"key": "final_detailing", "name": "Final Detailing", "sequence": 4},
    {"key": "initial_review", "name": "Initial Review", "sequence": 5},
    {"key": "issued_for_approval", "name": "Issued for Approval", "sequence": 6},
    {"key": "internal_review", "name": "Internal Review", "sequence": 7},
    {"key": "drawings_submitted", "name": "Drawings Submitted", "sequence": 8},
    {"key": "revision", "name": "Revision", "sequence": 9},
    {"key": "issued_for_construction", "name": "Issued for Construction", "sequence": 10},
    {"key": "complete", "name": "Complete", "sequence": 11},
]


class WorkflowStage(Base):
    __tablename__ = "workflow_stages"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<WorkflowStage {self.key}>"
