"use client";

import * as React from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { batchesApi } from "@/features/batches/api";
import { ApiError } from "@/lib/api-client";
import { isRoomEligibleForBatchPicker, roomIdsInActiveBatches } from "@/lib/batches";
import { stageVariant } from "@/lib/status";
import type { Batch, Room, WorkflowStage } from "@/types";

/**
 * Shared eligible-room picker used both to create a new Batch (project
 * detail page) and to add/remove rooms on an existing one (batch detail
 * page) — per the build spec's "reuse the same eligible-room picker" note.
 *
 * `batch` null = create mode (POST .../batches). `batch` set = edit mode
 * (PATCH /batches/{id}/rooms) — its own current members are shown with a
 * remove toggle instead of being excluded as "already in another batch."
 *
 * The eligibility pre-filter here is a UX convenience only, re-derived from
 * app/services/batch_service.py (see lib/batches.ts) — the server
 * independently re-checks and 400s on create/add, since a room can become
 * ineligible between page load and submit (someone else moves its stage, or
 * batches it elsewhere). That server message is surfaced verbatim on error.
 */
export function RoomPickerDialog({
  projectId,
  rooms,
  ifcIssuedStage,
  batches,
  batch,
  onClose,
  onCreated,
  onUpdated,
}: {
  projectId: number;
  rooms: Room[];
  ifcIssuedStage: WorkflowStage | null;
  batches: Batch[];
  batch?: Batch | null;
  onClose: () => void;
  onCreated?: (batch: Batch) => void;
  onUpdated?: (batch: Batch) => void;
}) {
  const isEdit = batch != null;
  const currentMemberIds = React.useMemo(
    () => new Set((batch?.rooms ?? []).map((r) => r.id)),
    [batch]
  );
  const activeBatchRoomIds = React.useMemo(() => {
    const ids = roomIdsInActiveBatches(batches);
    for (const id of currentMemberIds) ids.delete(id); // a batch's own members aren't a conflict with itself
    return ids;
  }, [batches, currentMemberIds]);

  const eligibleRooms = React.useMemo(() => {
    if (!ifcIssuedStage) return [];
    return rooms
      .filter((r) =>
        isRoomEligibleForBatchPicker(r, ifcIssuedStage, activeBatchRoomIds, currentMemberIds)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rooms, ifcIssuedStage, activeBatchRoomIds, currentMemberIds]);

  const [toAdd, setToAdd] = React.useState<Set<number>>(new Set());
  const [toRemove, setToRemove] = React.useState<Set<number>>(new Set());
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  function toggleAdd(id: number) {
    setToAdd((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleRemove(id: number) {
    setToRemove((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const canSubmit = isEdit ? toAdd.size > 0 || toRemove.size > 0 : toAdd.size > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      if (isEdit && batch) {
        const updated = await batchesApi.updateRooms(batch.id, {
          add_room_ids: Array.from(toAdd),
          remove_room_ids: Array.from(toRemove),
        });
        onUpdated?.(updated);
      } else {
        const created = await batchesApi.create(projectId, Array.from(toAdd));
        onCreated?.(created);
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save batch rooms.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const currentMembers = batch?.rooms ?? [];

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? `Add / remove rooms — Batch ${batch?.batch_number}` : "Create batch"}
      className="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {isEdit && currentMembers.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Current rooms ({currentMembers.length})
            </p>
            <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
              {currentMembers.map((room) => {
                const marked = toRemove.has(room.id);
                return (
                  <li
                    key={room.id}
                    className={`flex items-center justify-between gap-2 rounded px-1.5 py-1 text-sm ${
                      marked ? "opacity-50" : ""
                    }`}
                  >
                    <span className={marked ? "line-through" : ""}>{room.name}</span>
                    <button
                      type="button"
                      onClick={() => toggleRemove(room.id)}
                      className="text-muted-foreground hover:text-danger"
                      title={marked ? "Keep in batch" : "Remove from batch"}
                    >
                      {marked ? (
                        <span className="text-xs">Undo</span>
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {isEdit && currentMembers.length > 0 && <Separator />}

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              {isEdit ? "Add rooms" : "Select IFC-eligible rooms"} ({eligibleRooms.length}{" "}
              available)
            </p>
            {eligibleRooms.length > 0 && (
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() =>
                  setToAdd((prev) =>
                    prev.size === eligibleRooms.length
                      ? new Set()
                      : new Set(eligibleRooms.map((r) => r.id))
                  )
                }
              >
                {toAdd.size === eligibleRooms.length ? "Clear all" : "Select all"}
              </button>
            )}
          </div>

          {eligibleRooms.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
              No IFC-eligible rooms available — a room must have reached IFC Issued (or later,
              excluding IFC Revision or Complete) and not already be in another active batch.
            </p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
              {eligibleRooms.map((room) => (
                <li key={room.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-surface-muted">
                    <input
                      type="checkbox"
                      checked={toAdd.has(room.id)}
                      onChange={() => toggleAdd(room.id)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="flex-1">
                      {room.name}
                      {room.apartment_name && (
                        <span className="text-muted-foreground"> · {room.apartment_name}</span>
                      )}
                    </span>
                    <Badge variant={stageVariant(room.workflow_stage.key)}>
                      {room.workflow_stage.name}
                    </Badge>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={isSubmitting || !canSubmit}>
            {isSubmitting
              ? "Saving…"
              : isEdit
                ? "Save changes"
                : `Create batch${toAdd.size > 0 ? ` (${toAdd.size} rooms)` : ""}`}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
