"use client";

import * as React from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StageBadge } from "@/components/ui/stage-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { projectsApi } from "@/features/projects/api";
import { ApiError } from "@/lib/api-client";
import { BATCH_STATUS_LABELS, formatDate, stageVariant } from "@/lib/status";
import type { RoomStageTimelineItem } from "@/types";

/** BOM/Nesting cell: a batch status badge only when that phase is where
 * the room's batch actually is right now; "Done" (muted) once it's moved
 * past that phase; "—" when there's no batch yet or it hasn't reached that
 * phase. There's no per-phase timestamp to show a date here — Batch has no
 * status-history log, just its current status plus created_at/updated_at
 * (see docs/ARCHITECTURE.md §25) — so this is a standing/point-in-time
 * column, not a started/completed pair like IFA/IFC. */
function BatchPhaseCell({
  status,
  phase,
}: {
  status: RoomStageTimelineItem["batch_status"];
  phase: "bom" | "nesting";
}) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const isCurrent =
    phase === "bom" ? status === "bom_pending" || status === "bom_review" : status === "nesting";
  if (isCurrent) {
    return <Badge variant={phase === "bom" ? "info" : "warning"}>{BATCH_STATUS_LABELS[status]}</Badge>;
  }
  const isPast = phase === "bom" ? status !== "bom_pending" && status !== "bom_review" : status === "complete";
  if (isPast) return <Badge variant="success">Done</Badge>;
  return <span className="text-muted-foreground">—</span>;
}

function RevisionCell({ count }: { count: number }) {
  if (count === 0) return <span className="text-muted-foreground">—</span>;
  return <Badge variant="warning">{count}</Badge>;
}

/**
 * Per-room stage timeline for a whole project — when IFA/IFC started and
 * finished, how many times each came back for revision, and where the room
 * stands with its Batch (BOM/Nesting/batch number). One row per room,
 * distinct from the Apartments & Rooms tab's current-snapshot table: this
 * is the history/analytics view, that one is the working view. See
 * GET /projects/{id}/rooms/stage-timeline and docs/ARCHITECTURE.md §25.
 */
export function StageTimelineTable({ projectId }: { projectId: number }) {
  const [items, setItems] = React.useState<RoomStageTimelineItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    projectsApi
      .stageTimeline(projectId)
      .then(setItems)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load stage timeline."));
  }, [projectId]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!items) return <p className="text-sm text-muted-foreground">Loading stage timeline…</p>;
  if (items.length === 0) {
    return <p className="px-1 py-3 text-sm text-muted-foreground">No rooms yet.</p>;
  }

  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Room</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>IFA Started</TableHead>
              <TableHead>IFA Completed</TableHead>
              <TableHead>IFA Revisions</TableHead>
              <TableHead>IFC Started</TableHead>
              <TableHead>IFC Completed</TableHead>
              <TableHead>IFC Revisions</TableHead>
              <TableHead>BOM</TableHead>
              <TableHead>Nesting</TableHead>
              <TableHead>Batch #</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.room_id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/rooms/${item.room_id}`}
                    className="flex items-center gap-1.5 hover:text-primary hover:underline"
                  >
                    {item.room_name}
                  </Link>
                  {item.apartment_name && (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {item.apartment_name}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={stageVariant(item.workflow_stage.key)}>
                      {item.workflow_stage.name}
                    </Badge>
                    <StageBadge
                      room={{
                        workflow_stage: item.workflow_stage,
                        batch:
                          item.batch_id !== null && item.batch_status !== null
                            ? { id: item.batch_id, batch_number: item.batch_number ?? 0, status: item.batch_status }
                            : null,
                      }}
                    />
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDate(item.ifa_started_at)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDate(item.ifa_completed_at)}
                </TableCell>
                <TableCell>
                  <RevisionCell count={item.ifa_revision_count} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDate(item.ifc_started_at)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDate(item.ifc_completed_at)}
                </TableCell>
                <TableCell>
                  <RevisionCell count={item.ifc_revision_count} />
                </TableCell>
                <TableCell>
                  <BatchPhaseCell status={item.batch_status} phase="bom" />
                </TableCell>
                <TableCell>
                  <BatchPhaseCell status={item.batch_status} phase="nesting" />
                </TableCell>
                <TableCell>
                  {item.batch_id ? (
                    <Link
                      href={`/batches/${item.batch_id}`}
                      className="text-foreground hover:text-primary hover:underline"
                    >
                      Batch {item.batch_number}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
