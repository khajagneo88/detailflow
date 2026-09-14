"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Pencil,
  Play,
  PlayCircle,
  Plus,
  RotateCcw,
  Square,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/AuthContext";
import { commentsApi, roomsApi, workflowStagesApi } from "@/features/rooms/api";
import { timeEntriesApi } from "@/features/time-entries/api";
import { useTimeTracking } from "@/features/time-entries/TimeTrackingContext";
import { ApiError } from "@/lib/api-client";
import { WAITING_ON_SOMEONE_ELSE, getReadyForCheckTarget } from "@/lib/room-workflow";
import { formatElapsed, minutesToHours, useElapsedSeconds } from "@/lib/time";
import {
  COMMENT_STATUS_LABELS,
  COMMENT_STATUS_VARIANTS,
  COMMENT_TYPE_LABELS,
  COMMENT_TYPE_VARIANTS,
  PRIORITY_LABELS,
  PRIORITY_VARIANTS,
  ROOM_WORKFLOW_STATUS_LABELS,
  ROOM_WORKFLOW_STATUS_VARIANTS,
  STAGE_OUTCOME_LABELS,
  STAGE_OUTCOME_VARIANTS,
  TIME_ENTRY_SOURCE_LABELS,
  TIME_ENTRY_SOURCE_VARIANTS,
  formatDate,
  formatDateTime,
} from "@/lib/status";
import type {
  Comment,
  CommentType,
  Room,
  RoomStageEvent,
  StageTransitionOutcome,
  TimeEntry,
  WorkflowStage,
} from "@/types";

// Management roles can log time on behalf of / clean up after anyone;
// everyone else can only touch their own entries — mirrors
// app/api/routes/time_entries.py's _assert_can_modify.
const MANAGEMENT_TIME_ROLES = new Set(["admin", "manager", "team_leader"]);

// The one decision point in the fixed stage list where a room forks based on
// what came back from the client/team leader — see workflow_stage.py on the
// backend. Every other transition is a plain forward (or manual) move.
const DECISION_STAGE_KEY = "drawings_submitted";

const COMMENT_TYPES: CommentType[] = ["note", "rfi", "blocker"];
const OUTCOMES: StageTransitionOutcome[] = ["approved", "approved_with_comments", "markups_required"];

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function StageTransitionCard({
  room,
  stages,
  onTransitioned,
}: {
  room: Room;
  stages: WorkflowStage[];
  onTransitioned: (room: Room, event: RoomStageEvent) => void;
}) {
  const otherStages = stages.filter((s) => s.id !== room.workflow_stage.id);
  const [toStageKey, setToStageKey] = React.useState(otherStages[0]?.key ?? "");
  const [outcome, setOutcome] = React.useState<StageTransitionOutcome | "">("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const isDecisionPoint = room.workflow_stage.key === DECISION_STAGE_KEY;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!toStageKey) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const event = await roomsApi.createStageTransition(room.id, {
        to_stage_key: toStageKey,
        outcome: outcome || null,
        note: note || null,
      });
      const updatedRoom = await roomsApi.get(room.id);
      onTransitioned(updatedRoom, event);
      setNote("");
      setOutcome("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to move stage.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-foreground">Move stage</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="to-stage">Move to</Label>
            <Select
              id="to-stage"
              value={toStageKey}
              onChange={(e) => setToStageKey(e.target.value)}
            >
              {otherStages.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>

          {isDecisionPoint && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="outcome">Outcome</Label>
              <Select
                id="outcome"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as StageTransitionOutcome)}
              >
                <option value="">No outcome recorded</option>
                {OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {STAGE_OUTCOME_LABELS[o]}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                Drawings Submitted is the review checkpoint — record what came back before
                moving on to Issued for Construction or Revision.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transition-note">Note</Label>
            <Textarea
              id="transition-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional — markups received, reviewer feedback, etc."
            />
          </div>

          {error && (
            <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
          )}

          <Button type="submit" disabled={isSubmitting || !toStageKey}>
            {isSubmitting ? "Moving…" : "Move stage"}
            {!isSubmitting && <ArrowRight className="h-4 w-4" />}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** The detailer-facing alternative to StageTransitionCard — three plain
 * actions instead of an any-stage picker. Managers/team leaders/admins keep
 * the full picker (with outcome tracking) since deciding what comes back
 * from a review is their call, not a detailer's. See docs/ARCHITECTURE.md §12. */
function DetailerActionsCard({
  room,
  stages,
  onTransitioned,
  onStatusChanged,
  onCommentPosted,
}: {
  room: Room;
  stages: WorkflowStage[];
  onTransitioned: (room: Room, event: RoomStageEvent) => void;
  onStatusChanged: (room: Room) => void;
  onCommentPosted: (comment: Comment) => void;
}) {
  const [onHoldOpen, setOnHoldOpen] = React.useState(false);
  const [onHoldType, setOnHoldType] = React.useState<CommentType>("rfi");
  const [onHoldBody, setOnHoldBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"start" | "hold" | "ready" | null>(null);

  const readyTarget = getReadyForCheckTarget(room, stages);

  async function handleStart() {
    setError(null);
    setBusy("start");
    try {
      const updated = await roomsApi.updateStatus(room.id, "in_progress");
      onStatusChanged(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start.");
    } finally {
      setBusy(null);
    }
  }

  async function handleReadyForCheck() {
    if (!readyTarget) return;
    setError(null);
    setBusy("ready");
    try {
      const event = await roomsApi.createStageTransition(room.id, {
        to_stage_key: readyTarget.key,
      });
      const updatedRoom = await roomsApi.get(room.id);
      onTransitioned(updatedRoom, event);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to mark ready.");
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
      onCommentPosted(comment);
      const updatedRoom = await roomsApi.updateStatus(room.id, "blocked");
      onStatusChanged(updatedRoom);
      setOnHoldBody("");
      setOnHoldOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to put this on hold.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-foreground">Your actions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {room.workflow_status === "not_started" && (
          <Button onClick={handleStart} disabled={busy !== null}>
            <PlayCircle className="h-4 w-4" />
            {busy === "start" ? "Starting…" : "Start"}
          </Button>
        )}

        {readyTarget && (
          <Button onClick={handleReadyForCheck} disabled={busy !== null} variant="outline">
            <CheckCircle2 className="h-4 w-4" />
            {busy === "ready" ? "Marking ready…" : `Ready for Check (${readyTarget.name})`}
          </Button>
        )}

        {!onHoldOpen ? (
          <Button
            onClick={() => setOnHoldOpen(true)}
            disabled={busy !== null}
            variant="outline"
            className="border-danger/40 text-danger hover:bg-danger-bg"
          >
            <AlertTriangle className="h-4 w-4" />
            On Hold — flag a problem
          </Button>
        ) : (
          <form onSubmit={handleOnHoldSubmit} className="flex flex-col gap-3 rounded-md border border-border p-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="on-hold-type">Type</Label>
              <Select
                id="on-hold-type"
                value={onHoldType}
                onChange={(e) => setOnHoldType(e.target.value as CommentType)}
              >
                <option value="rfi">RFI — I need information</option>
                <option value="blocker">Blocker — something&apos;s stopping me</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="on-hold-body">What&apos;s the question or problem?</Label>
              <Textarea
                id="on-hold-body"
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

        {!readyTarget && room.workflow_status !== "not_started" && (
          <p className="text-xs text-muted-foreground">
            {WAITING_ON_SOMEONE_ELSE.has(room.workflow_stage.key)
              ? "This room is waiting on a review right now — nothing to mark ready."
              : "No further stage to move to."}
          </p>
        )}

        {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
      </CardContent>
    </Card>
  );
}

/** Start/stop a timer on this room, log a manual entry, and see/edit the
 * room's time history. The running timer itself is global state (there can
 * only be one, on any room) shared with the header's indicator via
 * TimeTrackingContext — this card is just another view onto it, plus the
 * per-room list that context doesn't need to know about. */
function TimeCard({
  room,
  entries,
  onEntriesChanged,
}: {
  room: Room;
  entries: TimeEntry[];
  onEntriesChanged: (entries: TimeEntry[]) => void;
}) {
  const { user } = useAuth();
  const { activeEntry, start, stop } = useTimeTracking();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [manualOpen, setManualOpen] = React.useState(false);
  const [manualDate, setManualDate] = React.useState("");
  const [manualMinutes, setManualMinutes] = React.useState("");
  const [manualNote, setManualNote] = React.useState("");
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [editMinutes, setEditMinutes] = React.useState("");
  const [editNote, setEditNote] = React.useState("");

  const isRunningHere = activeEntry?.room_id === room.id;
  const runningElsewhere = activeEntry && !isRunningHere ? activeEntry : null;
  const elapsed = useElapsedSeconds(isRunningHere ? activeEntry.started_at : null);
  const totalMinutes = entries.reduce((sum, e) => sum + (e.duration_minutes ?? 0), 0);

  function canModify(entry: TimeEntry): boolean {
    if (!user) return false;
    return entry.user_id === user.id || MANAGEMENT_TIME_ROLES.has(user.role);
  }

  async function reloadEntries() {
    onEntriesChanged(await timeEntriesApi.listForRoom(room.id));
  }

  async function runAction(action: () => Promise<void>, fallbackMessage: string) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallbackMessage);
    } finally {
      setBusy(false);
    }
  }

  const handleStart = () =>
    runAction(async () => {
      await start(room.id);
      await reloadEntries();
    }, "Failed to start timer.");

  const handleSwitchHere = () =>
    runAction(async () => {
      await stop();
      await start(room.id);
      await reloadEntries();
    }, "Failed to switch the timer here.");

  const handleStop = () =>
    runAction(async () => {
      await stop();
      await reloadEntries();
    }, "Failed to stop timer.");

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const minutes = Math.round(Number(manualMinutes));
    if (!manualDate || !minutes || minutes <= 0) return;
    await runAction(async () => {
      await timeEntriesApi.createManual(room.id, {
        started_at: new Date(manualDate).toISOString(),
        duration_minutes: minutes,
        note: manualNote || null,
      });
      await reloadEntries();
      setManualDate("");
      setManualMinutes("");
      setManualNote("");
      setManualOpen(false);
    }, "Failed to add entry.");
  }

  function startEdit(entry: TimeEntry) {
    setEditingId(entry.id);
    setEditMinutes(String(entry.duration_minutes ?? ""));
    setEditNote(entry.note ?? "");
  }

  async function handleEditSubmit(e: React.FormEvent, entry: TimeEntry) {
    e.preventDefault();
    const minutes = Math.round(Number(editMinutes));
    if (!minutes || minutes <= 0) return;
    await runAction(async () => {
      await timeEntriesApi.update(entry.id, { duration_minutes: minutes, note: editNote || null });
      await reloadEntries();
      setEditingId(null);
    }, "Failed to update entry.");
  }

  const handleDelete = (entry: TimeEntry) =>
    runAction(async () => {
      await timeEntriesApi.remove(entry.id);
      await reloadEntries();
    }, "Failed to delete entry.");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-foreground">Time</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total logged</span>
          <span className="font-medium tabular-nums">
            {minutesToHours(totalMinutes).toFixed(1)}h
          </span>
        </div>

        {isRunningHere ? (
          <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
            <span className="text-sm font-medium tabular-nums">{formatElapsed(elapsed)}</span>
            <Button size="sm" variant="outline" onClick={handleStop} disabled={busy}>
              <Square className="h-3.5 w-3.5 fill-current" />
              Stop
            </Button>
          </div>
        ) : runningElsewhere ? (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm">
            <p className="text-muted-foreground">
              You have a timer running on{" "}
              <span className="font-medium text-foreground">
                {runningElsewhere.room_name ?? "another room"}
              </span>
              .
            </p>
            <Button size="sm" variant="outline" onClick={handleSwitchHere} disabled={busy}>
              Switch timer here
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={handleStart} disabled={busy} className="self-start">
            <Play className="h-3.5 w-3.5" />
            Start timer
          </Button>
        )}

        {!manualOpen ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setManualOpen(true)}
            disabled={busy}
            className="self-start"
          >
            <Plus className="h-3.5 w-3.5" />
            Add manual entry
          </Button>
        ) : (
          <form
            onSubmit={handleManualSubmit}
            className="flex flex-col gap-3 rounded-md border border-border p-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="manual-date">When</Label>
                <Input
                  id="manual-date"
                  type="datetime-local"
                  required
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="manual-minutes">Minutes</Label>
                <Input
                  id="manual-minutes"
                  type="number"
                  min={1}
                  required
                  value={manualMinutes}
                  onChange={(e) => setManualMinutes(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="manual-note">Note (optional)</Label>
              <Textarea
                id="manual-note"
                rows={2}
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={busy}>
                Add entry
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => setManualOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <Separator />

        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No time logged yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((entry) => (
              <li key={entry.id} className="text-sm">
                {editingId === entry.id ? (
                  <form
                    onSubmit={(e) => handleEditSubmit(e, entry)}
                    className="flex flex-col gap-2 rounded-md border border-border p-2"
                  >
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min={1}
                        value={editMinutes}
                        onChange={(e) => setEditMinutes(e.target.value)}
                        className="w-24"
                      />
                      <Input
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        placeholder="Note"
                        className="flex-1"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={busy}>
                        Save
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant={TIME_ENTRY_SOURCE_VARIANTS[entry.source]}>
                          {TIME_ENTRY_SOURCE_LABELS[entry.source]}
                        </Badge>
                        <span className="font-medium">
                          {entry.duration_minutes !== null
                            ? `${minutesToHours(entry.duration_minutes).toFixed(1)}h`
                            : "Running"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {entry.user?.full_name ?? "Unknown"} · {formatDateTime(entry.started_at)}
                      </p>
                      {entry.note && <p className="mt-1 text-muted-foreground">{entry.note}</p>}
                    </div>
                    {entry.ended_at && canModify(entry) && (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => startEdit(entry)}
                          disabled={busy}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => handleDelete(entry)}
                          disabled={busy}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CommentThreadCard({
  room,
  comments,
  onCreated,
  onChanged,
}: {
  room: Room;
  comments: Comment[];
  onCreated: (comment: Comment) => void;
  onChanged: (comment: Comment) => void;
}) {
  const [type, setType] = React.useState<CommentType>("note");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [busyId, setBusyId] = React.useState<number | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const comment = await commentsApi.create(room.project_id, {
        room_id: room.id,
        apartment_id: room.apartment_id,
        type,
        title: title || null,
        body,
      });
      onCreated(comment);
      setTitle("");
      setBody("");
      setType("note");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to post comment.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggle(comment: Comment) {
    setBusyId(comment.id);
    try {
      const updated =
        comment.status === "open"
          ? await commentsApi.resolve(comment.id)
          : await commentsApi.reopen(comment.id);
      onChanged(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update comment.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-foreground">
          Comments &amp; RFIs
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {comments.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No comments yet — raise an RFI or flag a blocker below.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {comments.map((comment) => (
            <div key={comment.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant={COMMENT_TYPE_VARIANTS[comment.type]}>
                    {COMMENT_TYPE_LABELS[comment.type]}
                  </Badge>
                  <Badge variant={COMMENT_STATUS_VARIANTS[comment.status]}>
                    {COMMENT_STATUS_LABELS[comment.status]}
                  </Badge>
                  {comment.title && <span className="text-sm font-medium">{comment.title}</span>}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyId === comment.id}
                  onClick={() => handleToggle(comment)}
                >
                  {comment.status === "open" ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Resolve
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reopen
                    </>
                  )}
                </Button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{comment.body}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {comment.created_by?.full_name ?? "Unknown"} · {formatDateTime(comment.created_at)}
                {comment.status === "resolved" && comment.resolved_by && (
                  <>
                    {" "}
                    · resolved by {comment.resolved_by.full_name}
                    {comment.resolved_at ? ` on ${formatDateTime(comment.resolved_at)}` : ""}
                  </>
                )}
              </p>
            </div>
          ))}
        </div>

        <Separator />

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-4">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="comment-type">Type</Label>
              <Select
                id="comment-type"
                value={type}
                onChange={(e) => setType(e.target.value as CommentType)}
              >
                {COMMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {COMMENT_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-[2] flex-col gap-1.5">
              <Label htmlFor="comment-title">Title (optional)</Label>
              <Input
                id="comment-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="comment-body">
              {type === "rfi" ? "What do you need to know?" : type === "blocker" ? "What's blocking progress?" : "Comment"}
            </Label>
            <Textarea
              id="comment-body"
              rows={3}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          {error && (
            <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
          )}
          <Button type="submit" disabled={isSubmitting} className="self-start">
            {isSubmitting ? "Posting…" : "Post comment"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function StageHistoryCard({ events }: { events: RoomStageEvent[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-foreground">Stage history</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No stage changes recorded yet.</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {[...events].reverse().map((event) => (
              <li key={event.id} className="flex gap-3 text-sm">
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {event.from_stage && (
                      <>
                        <span className="text-muted-foreground">{event.from_stage.name}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      </>
                    )}
                    <span className="font-medium">{event.to_stage.name}</span>
                    {event.outcome && (
                      <Badge variant={STAGE_OUTCOME_VARIANTS[event.outcome]}>
                        {STAGE_OUTCOME_LABELS[event.outcome]}
                      </Badge>
                    )}
                  </div>
                  {event.note && <p className="text-muted-foreground">{event.note}</p>}
                  <p className="text-xs text-muted-foreground">
                    {event.changed_by?.full_name ?? "Unknown"} · {formatDateTime(event.created_at)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export default function RoomDetailPage() {
  const params = useParams<{ id: string }>();
  const roomId = Number(params.id);
  const { user } = useAuth();
  const isDetailer = user?.role === "detailer";

  const [room, setRoom] = React.useState<Room | null>(null);
  const [stages, setStages] = React.useState<WorkflowStage[] | null>(null);
  const [events, setEvents] = React.useState<RoomStageEvent[] | null>(null);
  const [comments, setComments] = React.useState<Comment[] | null>(null);
  const [entries, setEntries] = React.useState<TimeEntry[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    if (!Number.isFinite(roomId)) return;
    Promise.all([
      roomsApi.get(roomId),
      workflowStagesApi.list(),
      roomsApi.listStageEvents(roomId),
      timeEntriesApi.listForRoom(roomId),
    ])
      .then(([r, s, e, te]) => {
        setRoom(r);
        setStages(s);
        setEvents(e);
        setEntries(te);
        return commentsApi.listForRoom(r.project_id, roomId);
      })
      .then(setComments)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load room."));
  }, [roomId]);

  React.useEffect(load, [load]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!room || !stages || !events || !comments || !entries) {
    return <p className="text-sm text-muted-foreground">Loading room…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Link href={`/projects/${room.project_id}`} className="hover:text-primary hover:underline">
            Project
          </Link>
          {room.apartment_name && <> · {room.apartment_name}</>}
        </p>
        <h1 className="text-xl font-semibold tracking-tight">{room.name}</h1>
        {room.description && (
          <p className="text-sm text-muted-foreground">{room.description}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-foreground">Overview</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              <StatRow label="Stage" value={room.workflow_stage.name} />
              <StatRow
                label="Status"
                value={
                  <Badge variant={ROOM_WORKFLOW_STATUS_VARIANTS[room.workflow_status]}>
                    {ROOM_WORKFLOW_STATUS_LABELS[room.workflow_status]}
                  </Badge>
                }
              />
              <StatRow
                label="Priority"
                value={
                  <Badge variant={PRIORITY_VARIANTS[room.priority]}>
                    {PRIORITY_LABELS[room.priority]}
                  </Badge>
                }
              />
              <StatRow label="Detailer" value={room.assigned_detailer?.full_name ?? "Unassigned"} />
              <StatRow label="Due date" value={formatDate(room.due_date)} />
              <StatRow label="Estimated hours" value={room.estimated_hours ?? "—"} />
              <StatRow
                label="Progress"
                value={
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${room.progress}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {room.progress}%
                    </span>
                  </div>
                }
              />
              {room.notes && (
                <div className="py-2 text-sm">
                  <p className="mb-1 text-muted-foreground">Notes</p>
                  <p className="whitespace-pre-wrap">{room.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {isDetailer ? (
            <DetailerActionsCard
              room={room}
              stages={stages}
              onTransitioned={(updatedRoom, event) => {
                setRoom(updatedRoom);
                setEvents((prev) => (prev ? [...prev, event] : [event]));
              }}
              onStatusChanged={setRoom}
              onCommentPosted={(comment) =>
                setComments((prev) => (prev ? [comment, ...prev] : [comment]))
              }
            />
          ) : (
            <StageTransitionCard
              room={room}
              stages={stages}
              onTransitioned={(updatedRoom, event) => {
                setRoom(updatedRoom);
                setEvents((prev) => (prev ? [...prev, event] : [event]));
              }}
            />
          )}

          <TimeCard room={room} entries={entries} onEntriesChanged={setEntries} />
        </div>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <CommentThreadCard
            room={room}
            comments={comments}
            onCreated={(comment) => setComments((prev) => (prev ? [comment, ...prev] : [comment]))}
            onChanged={(comment) =>
              setComments((prev) => prev?.map((c) => (c.id === comment.id ? comment : c)) ?? null)
            }
          />
          <StageHistoryCard events={events} />
        </div>
      </div>
    </div>
  );
}
