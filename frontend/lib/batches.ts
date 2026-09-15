import type { Batch, Room, WorkflowStage } from "@/types";

/** Mirrors app/services/batch_service.py::assert_rooms_batch_eligible /
 * _INELIGIBLE_STAGE_KEYS exactly (re-derived by reading that file, not
 * guessed) — a room is batch-eligible once its stage has reached (an
 * approved) IFC Issued, i.e. sequence >= ifc_issued.sequence, excluding
 * ifc_revision (hasn't actually landed there) and complete (already
 * finished — see the JUDGMENT CALL comment in batch_service.py for why
 * Complete is excluded even though its sequence also qualifies). This is a
 * client-side pre-filter for UX only — the server re-checks and 400s
 * independently, so this list can go stale between page load and submit. */
const INELIGIBLE_STAGE_KEYS = new Set(["ifc_revision", "complete"]);

export function isRoomStageEligibleForBatch(room: Room, ifcIssuedStage: WorkflowStage): boolean {
  return (
    room.workflow_stage.sequence >= ifcIssuedStage.sequence &&
    !INELIGIBLE_STAGE_KEYS.has(room.workflow_stage.key)
  );
}

/** Room ids currently sitting in a batch that hasn't reached `complete` —
 * mirrors app/services/batch_service.py::assert_rooms_not_in_other_active_
 * batch. Built from the batches list itself (each BatchRead nests its real
 * member room ids) rather than from Room.batch_id, since the current
 * RoomRead schema doesn't serialize batch_id yet — see the JUDGMENT CALL on
 * the Room type in types/index.ts. */
export function roomIdsInActiveBatches(batches: Batch[]): Set<number> {
  const ids = new Set<number>();
  for (const batch of batches) {
    if (batch.status === "complete") continue;
    for (const room of batch.rooms) ids.add(room.id);
  }
  return ids;
}

/** Full eligibility check for the batch-creation/add-rooms room picker:
 * reached IFC Issued (or later, excluding ifc_revision/complete) AND not
 * already sitting in a different active batch. `currentBatchId` excludes a
 * room's own batch from the "already in another batch" check (e.g. the
 * add-rooms picker on a batch's own detail page shouldn't flag its own
 * existing members) — mirrors current_batch_id in assert_rooms_not_in_
 * other_active_batch. */
export function isRoomEligibleForBatchPicker(
  room: Room,
  ifcIssuedStage: WorkflowStage,
  activeBatchRoomIds: Set<number>,
  roomIdsInThisBatch: Set<number>
): boolean {
  if (!isRoomStageEligibleForBatch(room, ifcIssuedStage)) return false;
  if (roomIdsInThisBatch.has(room.id)) return false; // already a member here
  if (activeBatchRoomIds.has(room.id)) return false; // active in a different batch
  return true;
}
