import type { Room, WorkflowStage } from "@/types";

/** Urgency bucket for a room, independent of whose "current jobs" list it's
 * shown in — used by My Work (bucketed for one detailer) and the Team page's
 * Workload tab (bucketed per detailer, for everyone) so the two views can
 * never disagree about what counts as "needs attention" vs. "on track." */
export type Bucket = "attention" | "overdue" | "active" | "waiting" | "complete";

export function bucketFor(room: Room): Bucket {
  if (room.workflow_status === "blocked" || room.workflow_status === "changes_required") {
    return "attention";
  }
  if (room.workflow_status === "complete") return "complete";
  if (room.workflow_status === "ready_for_review" || room.workflow_status === "waiting") {
    return "waiting";
  }
  if (room.due_date && new Date(room.due_date) < new Date(new Date().toDateString())) {
    return "overdue";
  }
  return "active";
}

export const BUCKET_META: Record<Bucket, { title: string; hint: string }> = {
  attention: {
    title: "Needs your attention",
    hint: "Blocked, or came back with changes required.",
  },
  overdue: { title: "Overdue", hint: "Past their due date and still not finished." },
  active: { title: "In progress", hint: "Not started or currently being worked on." },
  waiting: { title: "Waiting on review", hint: "Handed off — nothing to do until it comes back." },
  complete: { title: "Complete", hint: "Finished." },
};

export const BUCKET_ORDER: Bucket[] = ["attention", "overdue", "active", "waiting", "complete"];

/** Sorts by urgency bucket first (see BUCKET_ORDER), then soonest due date —
 * the same tie-break /rooms/mine uses server-side, reimplemented client-side
 * here since the Workload tab's data comes from /reports/rooms unsorted. */
export function compareRoomUrgency(a: Room, b: Room): number {
  const bucketDiff = BUCKET_ORDER.indexOf(bucketFor(a)) - BUCKET_ORDER.indexOf(bucketFor(b));
  if (bucketDiff !== 0) return bucketDiff;
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return 0;
}

/** Where a detailer's simplified "Ready for Check" action goes next.
 * Almost always the immediate next stage in sequence, except Revision —
 * resubmitting after markups goes back to Drawings Submitted (sequence 8),
 * which is *earlier* than Revision (sequence 9), so it can't be derived
 * from sequence order alone. Shared by the room detail page and My Work. */
export const NEXT_STAGE_OVERRIDES: Record<string, string> = { revision: "drawings_submitted" };

/** A room sitting in one of these is waiting on someone else (a reviewer,
 * or it's already done) — there's nothing for the detailer to click. */
export const WAITING_ON_SOMEONE_ELSE = new Set([
  "initial_review",
  "issued_for_approval",
  "internal_review",
  "drawings_submitted",
  "issued_for_construction",
  "complete",
]);

export function getReadyForCheckTarget(room: Room, stages: WorkflowStage[]): WorkflowStage | null {
  const currentKey = room.workflow_stage.key;
  const targetKey = NEXT_STAGE_OVERRIDES[currentKey];
  if (targetKey) return stages.find((s) => s.key === targetKey) ?? null;
  if (WAITING_ON_SOMEONE_ELSE.has(currentKey)) return null;
  return stages.find((s) => s.sequence === room.workflow_stage.sequence + 1) ?? null;
}
