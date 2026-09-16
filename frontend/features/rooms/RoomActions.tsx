"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, PlayCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { commentsApi, roomsApi } from "@/features/rooms/api";
import { useTimeTracking } from "@/features/time-entries/TimeTrackingContext";
import { ApiError } from "@/lib/api-client";
import { WAITING_ON_SOMEONE_ELSE, getReadyForCheckTarget } from "@/lib/room-workflow";
import type { Comment, CommentType, Room, RoomStageEvent, WorkflowStage } from "@/types";

/** "Ready for Check" always means the same click (move to the next stage in
 * sequence), but what that click actually *is* depends on where the room
 * sits right now — leaving Drafted for the matching Internal Review stage
 * is a review submission worth naming explicitly; every other forward
 * move is a generic "next stage." Shared by My Work and the room detail
 * page so the label is never a lie about what's about to happen.
 *
 * §30 briefly relabelled this "IFA/IFC Complete" — corrected back per §32:
 * that name belongs to the Team Leader's *approval* of the review this
 * button only submits (see ReviewGateCard's "Mark IFA/IFC Complete" on the
 * room detail page), not to the detailer's own submission click, which
 * isn't "complete" at all yet — it's just been handed off for review. */
function nextStageLabel(targetKey: string, targetName: string): string {
  if (targetKey === "ifa_internal_review") return "Submit IFA Review";
  if (targetKey === "ifc_internal_review") return "Submit IFC Review";
  return `Next Stage (${targetName})`;
}

/** Which package a room's "Start" click is actually starting — every stage
 * Start can ever show at (see showStart below: drafted or revision, for
 * either cycle) belongs to exactly one of the two packages, so this is a
 * plain prefix check on the stage key, not a lookup table. See §30. */
function startLabel(stageKey: string): string {
  return stageKey.startsWith("ifa") ? "Start IFA" : "Start IFC";
}

/**
 * The full detailer action set for one room — Start, On Hold, and the
 * dynamically-labelled Next Stage / Submit IFA review / Submit IFC review —
 * shared by the room detail page's DetailerActionsCard and the My Work
 * page's per-row actions so the two never drift apart. See
 * docs/ARCHITECTURE.md's automatic time-tracking section: there's no
 * separate "start timer" step here — Start begins the detailer's automatic
 * stage-clock, and On Hold/Next Stage/Submit IFA/Submit IFC all stop it,
 * entirely as a backend side effect of these same calls (see
 * time_entry_service.auto_start_for_room/auto_stop_for_room). A 409 here
 * (surfaced as a plain error message) means the detailer already has
 * another room's clock running — that's what enforces one active task at
 * a time.
 */
export function RoomActions({
  room,
  stages,
  onStatusChanged,
  onTransitioned,
  onCommentPosted,
}: {
  room: Room;
  stages: WorkflowStage[];
  onStatusChanged: (room: Room) => void;
  onTransitioned: (room: Room, event: RoomStageEvent) => void;
  onCommentPosted?: (comment: Comment) => void;
}) {
  const [onHoldOpen, setOnHoldOpen] = React.useState(false);
  const [onHoldType, setOnHoldType] = React.useState<CommentType>("rfi");
  const [onHoldBody, setOnHoldBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"start" | "hold" | "next" | null>(null);
  const { activeEntry, refresh } = useTimeTracking();

  const readyTarget = getReadyForCheckTarget(room, stages);
  const isRunningHere = activeEntry?.room_id === room.id;
  const isComplete = room.workflow_status === "complete";
  const isWaitingOnSomeoneElse = WAITING_ON_SOMEONE_ELSE.has(room.workflow_stage.key) && !readyTarget;
  // Start doubles as "resume" — after a stage move that doesn't land on a
  // review checkpoint, or after coming back from On Hold or a revision,
  // the clock has stopped but there's still work to do here, so Start
  // shows again rather than being a one-shot per room.
  const showStart = !isComplete && !isWaitingOnSomeoneElse && !isRunningHere;

  async function handleStart() {
    setError(null);
    setBusy("start");
    try {
      const updated = await roomsApi.updateStatus(room.id, "in_progress");
      onStatusChanged(updated);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start.");
    } finally {
      setBusy(null);
    }
  }

  async function handleNextStage() {
    if (!readyTarget) return;
    setError(null);
    setBusy("next");
    try {
      const event = await roomsApi.createStageTransition(room.id, { to_stage_key: readyTarget.key });
      const updatedRoom = await roomsApi.get(room.id);
      onTransitioned(updatedRoom, event);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to move stage.");
    } finally {
      setBusy(null);
    }
  }

  async function handleOnHoldSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!onHoldBody.trim()) return;
    setError(null);
    setBusy("hold");
    try {
      const comment = await commentsApi.create(room.project_id, {
        room_id: room.id,
        apartment_id: room.apartment_id,
        type: onHoldType,
        body: onHoldBody,
      });
      onCommentPosted?.(comment);
      const updatedRoom = await roomsApi.updateStatus(room.id, "blocked");
      onStatusChanged(updatedRoom);
      await refresh();
      setOnHoldBody("");
      setOnHoldOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to put this on hold.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {showStart && (
          <Button size="sm" onClick={handleStart} disabled={busy !== null}>
            <PlayCircle className="h-3.5 w-3.5" />
            {busy === "start" ? "Starting…" : startLabel(room.workflow_stage.key)}
          </Button>
        )}

        {readyTarget && (
          <Button size="sm" variant="outline" onClick={handleNextStage} disabled={busy !== null}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            {busy === "next" ? "Moving…" : nextStageLabel(readyTarget.key, readyTarget.name)}
          </Button>
        )}

        {!isComplete && !onHoldOpen && (
          <Button
            size="sm"
            onClick={() => setOnHoldOpen(true)}
            disabled={busy !== null}
            variant="outline"
            className="border-danger/40 text-danger hover:bg-danger-bg"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            On Hold
          </Button>
        )}

        {!showStart && !readyTarget && !isComplete && (
          <span className="text-xs text-muted-foreground">
            {isRunningHere
              ? "Currently in progress."
              : "Waiting on a review — nothing to do right now."}
          </span>
        )}
      </div>

      {onHoldOpen && (
        <form
          onSubmit={handleOnHoldSubmit}
          className="flex flex-col gap-3 rounded-md border border-border p-3"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`on-hold-type-${room.id}`}>Type</Label>
            <Select
              id={`on-hold-type-${room.id}`}
              value={onHoldType}
              onChange={(e) => setOnHoldType(e.target.value as CommentType)}
            >
              <option value="rfi">RFI — I need information</option>
              <option value="blocker">Blocker — something&apos;s stopping me</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`on-hold-body-${room.id}`}>What&apos;s the question or problem?</Label>
            <Textarea
              id={`on-hold-body-${room.id}`}
              rows={3}
              required
              autoFocus
              value={onHoldBody}
              onChange={(e) => setOnHoldBody(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={busy !== null} size="sm">
              {busy === "hold" ? "Submitting…" : "Put on hold"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              onClick={() => {
                setOnHoldOpen(false);
                setOnHoldBody("");
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
