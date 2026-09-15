"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { planningApi } from "@/features/planning/api";
import { ApiError } from "@/lib/api-client";
import { categorizeBatchStatus, categorizeRoomStage, PLAN_CATEGORY_STYLES } from "@/lib/plan-colors";
import { formatDate } from "@/lib/status";
import type { EligibleTasks, PlanEntry, User } from "@/types";

/**
 * The Planning grid's "+ add task" picker — a searchable list of eligible
 * Rooms and Batches, top-priority-first (the order `eligibleTasks` already
 * arrives in from GET /planning/eligible-tasks — this component doesn't
 * re-sort). Selecting a row immediately creates the plan entry; there's no
 * separate "confirm" step, matching RoomPickerDialog's single-purpose
 * picker feel but simpler since a plan entry needs no multi-select.
 *
 * `plannedRoomIds`/`plannedBatchIds` (already planned for THIS date, by
 * anyone) are filtered out client-side — the same "client-side mirror of
 * the backend's uniqueness constraint, so the 409 case in practice never
 * happens except two managers racing" precedent the old weekly plan page
 * used (docs/ARCHITECTURE.md §16.5) — the server still independently
 * re-checks on create.
 */
export function TaskPickerDialog({
  detailer,
  date,
  eligibleTasks,
  plannedRoomIds,
  plannedBatchIds,
  onClose,
  onCreated,
}: {
  detailer: User;
  date: string;
  eligibleTasks: EligibleTasks | null;
  plannedRoomIds: Set<number>;
  plannedBatchIds: Set<number>;
  onClose: () => void;
  onCreated: (entry: PlanEntry) => void;
}) {
  const [search, setSearch] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submittingKey, setSubmittingKey] = React.useState<string | null>(null);

  const q = search.trim().toLowerCase();

  const rooms = (eligibleTasks?.rooms ?? []).filter((r) => !plannedRoomIds.has(r.id));
  const batches = (eligibleTasks?.batches ?? []).filter((b) => !plannedBatchIds.has(b.id));

  const filteredRooms = q
    ? rooms.filter((r) =>
        `${r.name} ${r.project_name ?? ""} ${r.apartment_name ?? ""}`.toLowerCase().includes(q)
      )
    : rooms;
  const filteredBatches = q
    ? batches.filter((b) =>
        `batch ${b.batch_number} ${b.project_name ?? ""}`.toLowerCase().includes(q)
      )
    : batches;

  async function pick(kind: "room" | "batch", id: number) {
    const key = `${kind}-${id}`;
    setError(null);
    setSubmittingKey(key);
    try {
      const entry = await planningApi.createEntry({
        user_id: detailer.id,
        date,
        room_id: kind === "room" ? id : null,
        batch_id: kind === "batch" ? id : null,
      });
      onCreated(entry);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add task.");
      setSubmittingKey(null);
    }
  }

  const nothingEligible = eligibleTasks && rooms.length === 0 && batches.length === 0;

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Add a task — ${detailer.full_name}, ${formatDate(date)}`}
      className="max-w-lg"
    >
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rooms or batches…"
            className="pl-8"
            autoFocus
          />
        </div>

        {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="max-h-96 overflow-y-auto rounded-md border border-border">
          {!eligibleTasks ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : nothingEligible ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nothing eligible to plan right now — every open room/batch is already planned
              somewhere, or everything is caught up.
            </p>
          ) : filteredRooms.length === 0 && filteredBatches.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matches for &quot;{search}&quot;.
            </p>
          ) : (
            <>
              {filteredRooms.length > 0 && (
                <div>
                  <p className="sticky top-0 bg-surface-muted px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Rooms ({filteredRooms.length})
                  </p>
                  <ul>
                    {filteredRooms.map((room) => {
                      const style = PLAN_CATEGORY_STYLES[categorizeRoomStage(room.workflow_stage.key)];
                      const key = `room-${room.id}`;
                      return (
                        <li key={key} className="border-b border-border last:border-b-0">
                          <button
                            type="button"
                            onClick={() => pick("room", room.id)}
                            disabled={submittingKey !== null}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate font-medium">{room.name}</span>
                              <span className="truncate text-xs text-muted-foreground">
                                {room.project_name}
                                {room.apartment_name ? ` · ${room.apartment_name}` : ""}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span
                                className={`h-2 w-2 shrink-0 rounded-full ${style.dotClass}`}
                                title={style.label}
                              />
                              <Badge variant="neutral" className="whitespace-nowrap">
                                {room.workflow_stage.name}
                              </Badge>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {filteredBatches.length > 0 && (
                <div>
                  <p className="sticky top-0 bg-surface-muted px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Batches ({filteredBatches.length})
                  </p>
                  <ul>
                    {filteredBatches.map((batch) => {
                      const style = PLAN_CATEGORY_STYLES[categorizeBatchStatus(batch.status)];
                      const key = `batch-${batch.id}`;
                      return (
                        <li key={key} className="border-b border-border last:border-b-0">
                          <button
                            type="button"
                            onClick={() => pick("batch", batch.id)}
                            disabled={submittingKey !== null}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate font-medium">Batch {batch.batch_number}</span>
                              <span className="truncate text-xs text-muted-foreground">
                                {batch.project_name}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span
                                className={`h-2 w-2 shrink-0 rounded-full ${style.dotClass}`}
                                title={style.label}
                              />
                              <Badge variant="neutral" className="whitespace-nowrap">
                                {style.label}
                              </Badge>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
