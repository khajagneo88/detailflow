# Imported under an alias: several models below have a field literally
# named `date`, and `field: date | None = None` (a default VALUE assigned
# in the same statement) rebinds the class-body name `date` to that
# default before the annotation expression `date | None` is evaluated —
# a real Python class-body-evaluation-order gotcha, not a typo. Using
# `_date` for every annotation below sidesteps it entirely while keeping
# the field itself named `date` (matching PlanEntry.date and the
# `?date=`/`date` query param this schema serialises).
from datetime import date as _date
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import BatchStatus, Priority
from app.schemas.user import UserRead
from app.schemas.workflow_stage import WorkflowStageRead


class PlanEntryCreate(BaseModel):
    user_id: int
    date: _date
    # Exactly one of these two — validated in the route (a clearer 400 than
    # letting the DB's CHECK constraint reject it, though that constraint is
    # still the real backstop). See PlanEntry's docstring.
    room_id: int | None = None
    batch_id: int | None = None
    # Omit to append to the end of that user/date's cell — see
    # plan_service.py::_next_position. Supplied explicitly when reordering.
    position: int | None = None
    note: str | None = None


class PlanEntryUpdate(BaseModel):
    """PATCH /planning/entries/{id} — moves an entry to a different
    detailer/day and/or reorders it. Deliberately excludes room_id/batch_id:
    changing *what* an entry points at is a remove-and-re-add on the
    frontend, not a field edit here."""

    user_id: int | None = None
    date: _date | None = None
    position: int | None = None
    note: str | None = None


class PlanEntryRoomRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    project_id: int
    project_name: str | None = None
    apartment_name: str | None = None
    workflow_stage: WorkflowStageRead
    priority: Priority
    due_date: _date | None


class PlanEntryBatchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    batch_number: int
    project_id: int
    project_name: str | None = None
    status: BatchStatus


class PlanEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    user: UserRead
    date: _date
    room_id: int | None
    batch_id: int | None
    room: PlanEntryRoomRead | None = None
    batch: PlanEntryBatchRead | None = None
    position: int
    note: str | None
    created_by_id: int | None
    created_at: datetime

    # Populated by the route only for room-linked entries within the
    # requested date range (see app/services/plan_service.py::
    # logged_minutes_map) — None means "nothing logged" (or "not
    # applicable", e.g. a batch-linked entry, or an entry outside the
    # range this particular response computed against). The frontend only
    # interprets this for a day that's already over — see lib/week.ts::
    # isPastDay — matching how §19's project/week marking only ever
    # recolored a *past* week's chips.
    logged_minutes: int | None = None

    # When this task actually reached "complete" — a room-linked entry
    # reads its most recent RoomStageEvent into the `complete` WorkflowStage
    # (app/services/plan_service.py::room_completed_at_map); a batch-linked
    # entry reuses the exact precedent app/api/routes/reports.py's
    # batch-throughput report already established (Batch.updated_at when
    # status == complete, since nothing updates a batch again after it's
    # marked complete — there's no dedicated completed_at column on either
    # Room or Batch, and this deliberately doesn't add one: it's computed
    # live from existing stage-history/status data on every read, the same
    # "stage history is the source of truth, don't cache derived state"
    # convention this app already follows for room completion elsewhere).
    # None means "never completed" (or not applicable/not computed for this
    # response). Powers the frontend's past-week green/red completion
    # highlight — a different question from logged_minutes' per-day
    # worked/not-worked signal above, which this field's frontend feature
    # replaces.
    task_completed_at: datetime | None = None


class EligibleRoomItem(BaseModel):
    """One row in the "add a task" picker's Rooms section — see
    app/services/plan_service.py::list_eligible_rooms for the eligibility
    rule and sort order."""

    id: int
    name: str
    project_id: int
    project_name: str | None
    apartment_name: str | None
    priority: Priority
    due_date: _date | None
    workflow_stage: WorkflowStageRead


class EligibleBatchItem(BaseModel):
    """One row in the picker's Batches section. `project_priority` is the
    sort proxy used in lieu of a priority field Batch doesn't have — see
    list_eligible_batches — surfaced here so the frontend doesn't need a
    second lookup to know why the list is ordered the way it is."""

    id: int
    batch_number: int
    project_id: int
    project_name: str | None
    status: BatchStatus
    project_priority: Priority


class EligibleTasksRead(BaseModel):
    rooms: list[EligibleRoomItem]
    batches: list[EligibleBatchItem]
