"use client";

import * as React from "react";
import Link from "next/link";
import { Layers, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RoomPickerDialog } from "@/features/batches/RoomPickerDialog";
import { batchesApi } from "@/features/batches/api";
import { projectsApi } from "@/features/projects/api";
import { workflowStagesApi } from "@/features/rooms/api";
import { ApiError } from "@/lib/api-client";
import { BATCH_STATUS_LABELS, batchStatusVariant, formatDate } from "@/lib/status";
import type { Batch, Room, WorkflowStage } from "@/types";

/**
 * The project detail page's "Batches" tab content: lists this project's
 * batches (batch number, status, room count, created date), each linking to
 * its detail page, plus a Nester-only "Create batch" action that opens the
 * shared eligible-room picker. Everyone else sees the same list read-only —
 * `canManage` is computed by the caller (project page) the same way
 * MANAGEMENT_ROLES gates Add apartment/room there, since batch creation and
 * room add/remove are Nester-only server-side too (require_nester on those
 * two routes — see app/api/routes/batches.py) and the control should be
 * hidden, not shown-then-403.
 */
export function BatchesSection({ projectId, canManage }: { projectId: number; canManage: boolean }) {
  const [batches, setBatches] = React.useState<Batch[] | null>(null);
  const [rooms, setRooms] = React.useState<Room[] | null>(null);
  const [stages, setStages] = React.useState<WorkflowStage[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);

  const load = React.useCallback(() => {
    Promise.all([
      batchesApi.listForProject(projectId),
      workflowStagesApi.list(),
      // Rooms are needed for the create-batch picker (batch-eligible rooms
      // across the whole project, not just one apartment) — fetched here
      // rather than threaded down from the parent page, since this section
      // is the only thing that needs the eligibility computation.
      projectsApi.listRooms(projectId),
    ])
      .then(([b, s, r]) => {
        setBatches(b);
        setStages(s);
        setRooms(r);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load batches."));
  }, [projectId]);

  React.useEffect(load, [load]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!batches || !rooms || !stages) {
    return <p className="text-sm text-muted-foreground">Loading batches…</p>;
  }

  const ifcIssuedStage = stages.find((s) => s.key === "ifc_issued") ?? null;

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Create batch
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-foreground">Batches</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {batches.length === 0 ? (
            <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
              <Layers className="h-4 w-4" />
              No batches yet — a Nester groups IFC-approved rooms into a batch to drive BOM and
              nesting.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Rooms</TableHead>
                  <TableHead>Nester</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.id} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <Link
                        href={`/batches/${batch.id}`}
                        className="hover:text-primary hover:underline"
                      >
                        Batch {batch.batch_number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={batchStatusVariant(batch.status)}>
                        {BATCH_STATUS_LABELS[batch.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>{batch.room_count}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {batch.nester.full_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(batch.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canManage && createOpen && (
        <RoomPickerDialog
          projectId={projectId}
          rooms={rooms}
          ifcIssuedStage={ifcIssuedStage}
          batches={batches}
          onClose={() => setCreateOpen(false)}
          onCreated={(batch) => setBatches((prev) => (prev ? [...prev, batch] : [batch]))}
        />
      )}
    </div>
  );
}
