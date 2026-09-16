"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, CheckCircle2, Pencil, RotateCcw, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { StageBadge } from "@/components/ui/stage-badge";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/AuthContext";
import { batchesApi } from "@/features/batches/api";
import { commentsApi, roomsApi, workflowStagesApi } from "@/features/rooms/api";
import { RoomActions } from "@/features/rooms/RoomActions";
import { timeEntriesApi } from "@/features/time-entries/api";
import { ApiError } from "@/lib/api-client";
import { minutesToHours } from "@/lib/time";
import {
  BATCH_STATUS_LABELS,
  batchStatusVariant,
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
  stageVariant,
} from "@/lib/status";
import type {
  Batch,
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

// The one *required* decision point in the fixed stage list — a room here
// forks based on what came back from the client. IFC Issued is deliberately
// NOT a second required gate: client involvement after IFC is optional/rare
// (see VariationLogger below) — see workflow_stage.py on the backend.
// Every other transition is a plain forward (or manual) move.
const DECISION_STAGE_KEY = "ifa_issued";

// The one stage where a late, optional client change can be logged without
// gating the normal forward transition to Complete — see workflow_stage.py's
// DEFAULT_WORKFLOW_STAGES comment and VariationLogger below.
const VARIATION_STAGE_KEY = "ifc_issued";

const COMMENT_TYPES: CommentType[] = ["note", "rfi", "blocker", "variation"];
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
                IFA Issued is the client-approval checkpoint — record what came back before
                moving on to IFC Drafted or IFA Revision.
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

/** The detailer-facing alternative to StageTransitionCard — Start / On Hold
 * / Next Stage (dynamically labelled Submit IFA/IFC review at the two
 * review checkpoints) instead of an any-stage picker, shared with My Work
 * via features/rooms/RoomActions.tsx. Managers/team leaders/admins keep the
 * full picker (with outcome tracking) since deciding what comes back from a
 * review is their call, not a detailer's. See docs/ARCHITECTURE.md §12. */
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
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-foreground">Your actions</CardTitle>
      </CardHeader>
      <CardContent>
        <RoomActions
          room={room}
          stages={stages}
          onStatusChanged={onStatusChanged}
          onTransitioned={(updatedRoom, event) => onTransitioned(updatedRoom, event)}
          onCommentPosted={onCommentPosted}
        />
      </CardContent>
    </Card>
  );
}

/** Read-only view of this room's automatically-tracked time — there's no
 * more manual "start timer"/"stop"/"add manual entry" flow (see
 * docs/ARCHITECTURE.md's automatic time-tracking section and
 * features/rooms/RoomActions.tsx, which is what actually starts/stops the
 * clock now, as a side effect of the detailer's own action buttons). Edit
 * and delete are kept for correcting an entry after the fact — whoever
 * logged it, or a manager/team leader/admin cleaning up on anyone's
 * behalf. */
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
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [editMinutes, setEditMinutes] = React.useState("");
  const [editNote, setEditNote] = React.useState("");

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
        <p className="text-xs text-muted-foreground">
          Tracked automatically from Start / On Hold / Next Stage — no manual timer to run.
        </p>

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
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);

  const isVariationEligible = room.workflow_stage.key === VARIATION_STAGE_KEY;

  function startVariation() {
    setType("variation");
    bodyRef.current?.focus();
  }

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

        {isVariationEligible && type !== "variation" && (
          <button
            type="button"
            onClick={startVariation}
            className="self-start text-xs font-medium text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            Log a late client change (Variation)
          </button>
        )}

        <Separator />

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {type === "variation" && (
            <p className="rounded-md bg-warning-bg px-3 py-2 text-xs text-warning">
              This won&apos;t block moving the room forward — it just records that the client
              asked for a change after IFC Issued.
            </p>
          )}
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
              ref={bodyRef}
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
                        <Badge variant={stageVariant(event.from_stage.key)}>
                          {event.from_stage.name}
                        </Badge>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      </>
                    )}
                    <Badge variant={stageVariant(event.to_stage.key)}>{event.to_stage.name}</Badge>
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
  // undefined = not looked up yet; null = confirmed not in a batch. Looked
  // up by scanning the project's batches for one that nests this room's id
  // rather than trusting Room.batch_id — RoomRead doesn't serialize that
  // field yet (see the JUDGMENT CALL comment on Room in types/index.ts).
  const [batch, setBatch] = React.useState<Batch | null | undefined>(undefined);
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
        batchesApi
          .listForProject(r.project_id)
          .then((batches) => setBatch(batches.find((b) => b.rooms.some((br) => br.id === r.id)) ?? null))
          .catch(() => setBatch(null)); // non-fatal — the batch info line just won't show
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
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          {room.name}
          <StageBadge room={room} />
        </h1>
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
              <StatRow
                label="Stage"
                value={
                  <Badge variant={stageVariant(room.workflow_stage.key)}>
                    {room.workflow_stage.name}
                  </Badge>
                }
              />
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
              {batch && (
                <StatRow
                  label="Batch"
                  value={
                    <Link
                      href={`/batches/${batch.id}`}
                      className="flex items-center gap-1.5 hover:text-primary hover:underline"
                    >
                      <span>Batch {batch.batch_number}</span>
                      <Badge variant={batchStatusVariant(batch.status)}>
                        {BATCH_STATUS_LABELS[batch.status]}
                      </Badge>
                    </Link>
                  }
                />
              )}
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
