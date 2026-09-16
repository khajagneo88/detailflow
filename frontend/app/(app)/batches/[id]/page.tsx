"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, PlayCircle, Plus, Undo2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/features/auth/AuthContext";
import { RoomPickerDialog } from "@/features/batches/RoomPickerDialog";
import { batchesApi } from "@/features/batches/api";
import { projectsApi } from "@/features/projects/api";
import { workflowStagesApi } from "@/features/rooms/api";
import { ApiError } from "@/lib/api-client";
import { BATCH_STATUS_LABELS, batchStatusVariant, formatDateTime, stageVariant } from "@/lib/status";
import type { Batch, BatchStatus, Project, Room, WorkflowStage } from "@/types";

// The Nester who owns a batch drives it forward: submitting the BOM for
// review, and — once the Team Leader has approved into nesting — completing
// the nest. The Team Leader (plus Manager/Admin, who can act on anyone's
// behalf everywhere else in this app) own the bom_review gate itself:
// approve into nesting, or send it back for changes. This mirrors the
// build spec exactly; note this is FRONTEND-ONLY enforcement — see the
// docstring on POST /batches/{id}/status-transitions in
// app/api/routes/batches.py, which (deliberately, matching the existing
// room-transition endpoint's precedent) has no server-side role check at
// all, so a determined non-Nester/non-reviewer could still hit the API
// directly. Room add/remove and batch creation ARE server-enforced
// (require_nester on those two routes).
const NESTER_ROLE = "nester";
const REVIEW_ROLES = new Set(["admin", "manager", "team_leader"]);

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/** Six labelled actions total, matching the same "Start X / X Complete"
 * naming the room detail page's Start IFA/IFA Complete/Start IFC/IFC
 * Complete pair uses (§30) — but only four of the six change `status`:
 * "Start BOM"/"Start Nesting" are the Nester recording *when* they
 * actually began that phase (Batch.bom_started_at/nesting_started_at),
 * with no transition of their own and no bearing on what else is
 * clickable — a Nester can hit "BOM Complete" whether or not they ever
 * clicked "Start BOM" first, same as a detailer can submit a room for
 * review whether or not "Start" was ever clicked (docs/ARCHITECTURE.md
 * §20/§23.3's "Start doubles as a convenience, not a gate" precedent). */
function LifecycleControls({
  batch,
  canNester,
  canReview,
  onTransitioned,
}: {
  batch: Batch;
  canNester: boolean;
  canReview: boolean;
  onTransitioned: (batch: Batch) => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function run(key: string, fn: () => Promise<Batch>, errorMessage: string) {
    setError(null);
    setBusy(key);
    try {
      const updated = await fn();
      onTransitioned(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : errorMessage);
    } finally {
      setBusy(null);
    }
  }

  const transition = (status: BatchStatus) =>
    run(status, () => batchesApi.createStatusTransition(batch.id, status), "Failed to move the batch.");

  const actions: {
    key: string;
    label: string;
    icon: React.ReactNode;
    visible: boolean;
    onClick: () => void;
    warning?: boolean;
  }[] = [
    {
      key: "start-bom",
      label: "Start BOM",
      icon: <PlayCircle className="h-4 w-4" />,
      visible: batch.status === "bom_pending" && canNester && !batch.bom_started_at,
      onClick: () => run("start-bom", () => batchesApi.startBom(batch.id), "Failed to record BOM start."),
    },
    {
      key: "bom_review",
      label: "BOM Complete",
      icon: <CheckCircle2 className="h-4 w-4" />,
      visible: batch.status === "bom_pending" && canNester,
      onClick: () => transition("bom_review"),
    },
    {
      key: "nesting",
      label: "Approve — start nesting",
      icon: <CheckCircle2 className="h-4 w-4" />,
      visible: batch.status === "bom_review" && canReview,
      onClick: () => transition("nesting"),
    },
    {
      key: "bom_pending",
      label: "Send back — changes needed",
      icon: <Undo2 className="h-4 w-4" />,
      visible: batch.status === "bom_review" && canReview,
      onClick: () => transition("bom_pending"),
      warning: true,
    },
    {
      key: "start-nesting",
      label: "Start Nesting",
      icon: <PlayCircle className="h-4 w-4" />,
      visible: batch.status === "nesting" && canNester && !batch.nesting_started_at,
      onClick: () =>
        run("start-nesting", () => batchesApi.startNesting(batch.id), "Failed to record nesting start."),
    },
    {
      key: "complete",
      label: "Nesting Complete",
      icon: <CheckCircle2 className="h-4 w-4" />,
      visible: batch.status === "nesting" && canNester,
      onClick: () => transition("complete"),
    },
  ];

  const visibleActions = actions.filter((a) => a.visible);

  const startedNotes = (
    <>
      {batch.bom_started_at && (
        <p className="text-xs text-muted-foreground">BOM started {formatDateTime(batch.bom_started_at)}</p>
      )}
      {batch.nesting_started_at && (
        <p className="text-xs text-muted-foreground">
          Nesting started {formatDateTime(batch.nesting_started_at)}
        </p>
      )}
    </>
  );

  if (batch.status === "complete") {
    return (
      <Card>
        <CardContent className="flex flex-col gap-2 py-4">
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" />
            This batch is complete — every room in it has been moved to Complete.
          </p>
          {startedNotes}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-foreground">Status</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {startedNotes}
        {visibleActions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {batch.status === "bom_pending" &&
              "Waiting on the Nester to submit this BOM for review."}
            {batch.status === "bom_review" &&
              "Waiting on a Team Leader, Manager or Admin to review this BOM."}
            {batch.status === "nesting" && "Waiting on the Nester to complete nesting."}
          </p>
        ) : (
          visibleActions.map((action) => (
            <Button
              key={action.key}
              onClick={action.onClick}
              disabled={busy !== null}
              variant={action.warning ? "outline" : "default"}
              className={action.warning ? "border-warning/40 text-warning hover:bg-warning-bg" : ""}
            >
              {action.icon}
              {busy === action.key ? "Saving…" : action.label}
            </Button>
          ))
        )}
        {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
      </CardContent>
    </Card>
  );
}

export default function BatchDetailPage() {
  const params = useParams<{ id: string }>();
  const batchId = Number(params.id);
  const { user } = useAuth();

  const [batch, setBatch] = React.useState<Batch | null>(null);
  const [project, setProject] = React.useState<Project | null>(null);
  const [rooms, setRooms] = React.useState<Room[] | null>(null);
  const [allBatches, setAllBatches] = React.useState<Batch[] | null>(null);
  const [stages, setStages] = React.useState<WorkflowStage[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const load = React.useCallback(() => {
    if (!Number.isFinite(batchId)) return;
    batchesApi
      .get(batchId)
      .then((b) => {
        setBatch(b);
        return Promise.all([
          projectsApi.get(b.project_id),
          projectsApi.listRooms(b.project_id),
          batchesApi.listForProject(b.project_id),
          workflowStagesApi.list(),
        ]);
      })
      .then(([p, r, batches, s]) => {
        setProject(p);
        setRooms(r);
        setAllBatches(batches);
        setStages(s);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load batch."));
  }, [batchId]);

  React.useEffect(load, [load]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!batch || !project || !rooms || !allBatches || !stages) {
    return <p className="text-sm text-muted-foreground">Loading batch…</p>;
  }

  const isNester = user?.role === NESTER_ROLE;
  const isReviewer = user !== null && REVIEW_ROLES.has(user.role);
  const canEditRooms = isNester && batch.status !== "complete";
  const ifcIssuedStage = stages.find((s) => s.key === "ifc_issued") ?? null;

  function handleBatchUpdated(updated: Batch) {
    setBatch(updated);
    setAllBatches((prev) => (prev ? prev.map((b) => (b.id === updated.id ? updated : b)) : prev));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Link
              href={`/projects/${project.id}`}
              className="hover:text-primary hover:underline"
            >
              {project.project_number} · {project.name}
            </Link>
          </p>
          <h1 className="text-xl font-semibold tracking-tight">Batch {batch.batch_number}</h1>
          <p className="text-sm text-muted-foreground">
            Nester: {batch.nester.full_name}
          </p>
        </div>
        <Badge variant={batchStatusVariant(batch.status)}>{BATCH_STATUS_LABELS[batch.status]}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-foreground">Overview</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              <StatRow label="Status" value={BATCH_STATUS_LABELS[batch.status]} />
              <StatRow label="Rooms" value={batch.room_count} />
              <StatRow label="Nester" value={batch.nester.full_name} />
              <StatRow label="Created" value={formatDateTime(batch.created_at)} />
              <StatRow label="Last updated" value={formatDateTime(batch.updated_at)} />
            </CardContent>
          </Card>

          <LifecycleControls
            batch={batch}
            canNester={isNester}
            canReview={isReviewer}
            onTransitioned={handleBatchUpdated}
          />
        </div>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold text-foreground">
                Rooms ({batch.rooms.length})
              </CardTitle>
              {canEditRooms && (
                <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Add / remove rooms
                </Button>
              )}
            </CardHeader>
            <Separator />
            <CardContent className="p-0">
              {batch.rooms.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">
                  No rooms in this batch yet.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {batch.rooms.map((room) => (
                    <li key={room.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                      <Link
                        href={`/rooms/${room.id}`}
                        className="text-sm font-medium hover:text-primary hover:underline"
                      >
                        {room.name}
                      </Link>
                      <Badge variant={stageVariant(room.workflow_stage.key)}>
                        {room.workflow_stage.name}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {batch.status === "complete" && (
            <p className="flex items-center gap-2 rounded-md bg-success-bg px-3 py-2 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" />
              Batch complete — every room above has been cascaded to the Complete stage.
            </p>
          )}
        </div>
      </div>

      {canEditRooms && pickerOpen && (
        <RoomPickerDialog
          projectId={project.id}
          rooms={rooms}
          ifcIssuedStage={ifcIssuedStage}
          batches={allBatches}
          batch={batch}
          onClose={() => setPickerOpen(false)}
          onUpdated={handleBatchUpdated}
        />
      )}
    </div>
  );
}
