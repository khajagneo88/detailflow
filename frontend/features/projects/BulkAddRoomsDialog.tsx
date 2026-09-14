"use client";

import * as React from "react";
import { ClipboardPaste, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { projectsApi } from "@/features/projects/api";
import { ApiError } from "@/lib/api-client";
import { parseBulkRoomText } from "@/lib/bulk-paste";
import { PRIORITY_LABELS } from "@/lib/status";
import type { Apartment, Priority, Room, User } from "@/types";

const ROOM_PRIORITIES: Priority[] = ["low", "normal", "high", "urgent"];

interface EditableRow {
  id: number;
  room: string;
  apartment: string;
}

type Step = "paste" | "preview" | "creating" | "result";

interface RowResult {
  room: string;
  status: "created" | "failed" | "skipped";
  detail?: string;
}

/** Paste a block of room names straight out of a spreadsheet — see
 * lib/bulk-paste.ts for the parsing rules and docs/ARCHITECTURE.md §18 for
 * the full design. Every parsed row is editable before anything is
 * created; nothing is sent to the backend until "Create rooms" on the
 * preview step. */
export function BulkAddRoomsDialog({
  projectId,
  apartments,
  detailers,
  onClose,
  onApartmentCreated,
  onRoomCreated,
}: {
  projectId: number;
  apartments: Apartment[];
  detailers: User[];
  onClose: () => void;
  onApartmentCreated: (apartment: Apartment) => void;
  onRoomCreated: (room: Room) => void;
}) {
  const [step, setStep] = React.useState<Step>("paste");
  const [rawText, setRawText] = React.useState("");
  const [detectApartments, setDetectApartments] = React.useState(true);
  const [defaultPriority, setDefaultPriority] = React.useState<Priority>("normal");
  const [defaultDetailerId, setDefaultDetailerId] = React.useState("");
  const [defaultDueDate, setDefaultDueDate] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const [rows, setRows] = React.useState<EditableRow[]>([]);
  const [skippedBlankCount, setSkippedBlankCount] = React.useState(0);

  const [progress, setProgress] = React.useState({ done: 0, total: 0 });
  const [results, setResults] = React.useState<RowResult[]>([]);

  function handlePreview() {
    const parsed = parseBulkRoomText(rawText, detectApartments);
    const nonBlank = parsed.filter((p) => p.room.trim().length > 0);
    setSkippedBlankCount(parsed.length - nonBlank.length);
    setRows(nonBlank.map((p, i) => ({ id: i, room: p.room, apartment: p.apartment })));
    setError(null);
    setStep("preview");
  }

  function updateRow(id: number, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: number) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function clearAllApartments() {
    setRows((prev) => prev.map((r) => ({ ...r, apartment: "" })));
  }

  const distinctApartmentNames = Array.from(
    new Set(rows.map((r) => r.apartment.trim()).filter((a) => a.length > 0))
  );
  const existingByLowerName = new Map(apartments.map((a) => [a.name.toLowerCase(), a]));
  const newApartmentCount = distinctApartmentNames.filter(
    (name) => !existingByLowerName.has(name.toLowerCase())
  ).length;

  async function handleCreate() {
    const validRows = rows.filter((r) => r.room.trim().length > 0);
    setStep("creating");
    setProgress({ done: 0, total: validRows.length });

    // Resolve/create every distinct apartment first, so every room create
    // below already knows its apartment_id (or that it failed and should
    // be skipped rather than silently created unassigned).
    const nameToId = new Map<string, number>();
    for (const a of apartments) nameToId.set(a.name.toLowerCase(), a.id);
    const failedApartmentNames = new Set<string>();

    for (const name of distinctApartmentNames) {
      const key = name.toLowerCase();
      if (nameToId.has(key)) continue;
      try {
        const created = await projectsApi.createApartment(projectId, { name });
        nameToId.set(key, created.id);
        onApartmentCreated(created);
      } catch {
        failedApartmentNames.add(key);
      }
    }

    const rowResults: RowResult[] = [];
    let done = 0;
    for (const row of validRows) {
      const aptKey = row.apartment.trim().toLowerCase();
      if (aptKey && failedApartmentNames.has(aptKey)) {
        rowResults.push({
          room: row.room,
          status: "skipped",
          detail: `"${row.apartment.trim()}" couldn't be created`,
        });
        done += 1;
        setProgress({ done, total: validRows.length });
        continue;
      }
      try {
        const room = await projectsApi.createRoom(projectId, {
          name: row.room.trim(),
          apartment_id: aptKey ? nameToId.get(aptKey) ?? null : null,
          assigned_detailer_id: defaultDetailerId ? Number(defaultDetailerId) : null,
          priority: defaultPriority,
          due_date: defaultDueDate || null,
        });
        onRoomCreated(room);
        rowResults.push({ room: row.room, status: "created" });
      } catch (err) {
        rowResults.push({
          room: row.room,
          status: "failed",
          detail: err instanceof ApiError ? err.message : "Failed to create.",
        });
      }
      done += 1;
      setProgress({ done, total: validRows.length });
    }

    setResults(rowResults);
    setStep("result");
  }

  const createdCount = results.filter((r) => r.status === "created").length;
  const problemResults = results.filter((r) => r.status !== "created");

  return (
    <Dialog open onClose={onClose} title="Bulk add rooms" className="w-full max-w-2xl">
      {step === "paste" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Paste room names straight out of your sheet, one per line — e.g. &quot;Kitchen
            101&quot;. If a line ends in a number, that&apos;s read as the apartment; you can
            fix any mistakes before anything gets created.
          </p>
          <Textarea
            autoFocus
            rows={8}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={"Kitchen 101\nEnsuite 101\nWardrobe 101\nKitchen 102\nEnsuite 102"}
            className="font-mono text-xs"
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={detectApartments}
              onChange={(e) => setDetectApartments(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Try to detect apartment numbers in room names
          </label>

          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-priority">Priority</Label>
              <Select
                id="bulk-priority"
                value={defaultPriority}
                onChange={(e) => setDefaultPriority(e.target.value as Priority)}
              >
                {ROOM_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-detailer">Detailer</Label>
              <Select
                id="bulk-detailer"
                value={defaultDetailerId}
                onChange={(e) => setDefaultDetailerId(e.target.value)}
              >
                <option value="">Unassigned</option>
                {detailers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-due">Due date</Label>
              <Input
                id="bulk-due"
                type="date"
                value={defaultDueDate}
                onChange={(e) => setDefaultDueDate(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            These apply to every room in this batch — edit priority, detailer or due date
            individually afterward if they differ room to room.
          </p>

          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex items-center gap-2">
            <Button type="button" disabled={!rawText.trim()} onClick={handlePreview}>
              <ClipboardPaste className="h-3.5 w-3.5" />
              Preview
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {rows.length} room{rows.length === 1 ? "" : "s"}
              {distinctApartmentNames.length > 0 &&
                ` across ${distinctApartmentNames.length} apartment${distinctApartmentNames.length === 1 ? "" : "s"}`}
              {newApartmentCount > 0 && ` (${newApartmentCount} new)`}
              {skippedBlankCount > 0 && ` · ${skippedBlankCount} blank line(s) skipped`}
            </p>
            <Button type="button" size="sm" variant="ghost" onClick={clearAllApartments}>
              Clear all apartments
            </Button>
          </div>

          <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-muted text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Room</th>
                  <th className="px-3 py-2 text-left">Apartment</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="p-1.5">
                      <Input
                        value={row.room}
                        onChange={(e) => updateRow(row.id, { room: e.target.value })}
                        className="h-8"
                      />
                    </td>
                    <td className="p-1.5">
                      <Input
                        value={row.apartment}
                        onChange={(e) => updateRow(row.id, { apartment: e.target.value })}
                        placeholder="No apartment"
                        className="h-8"
                      />
                    </td>
                    <td className="p-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="text-muted-foreground hover:text-danger"
                        aria-label={`Remove ${row.room || "row"}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" disabled={rows.length === 0} onClick={handleCreate}>
              Create {rows.length} room{rows.length === 1 ? "" : "s"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStep("paste")}>
              Back
            </Button>
          </div>
        </div>
      )}

      {step === "creating" && (
        <div className="flex flex-col items-center gap-3 py-6">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`,
              }}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Creating {progress.done} of {progress.total}…
          </p>
        </div>
      )}

      {step === "result" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            Created <span className="font-medium">{createdCount}</span> of {results.length} room
            {results.length === 1 ? "" : "s"}.
          </p>
          {problemResults.length > 0 && (
            <div className="max-h-[40vh] overflow-y-auto rounded-md border border-border">
              {problemResults.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0"
                >
                  <span>{r.room}</span>
                  <Badge variant={r.status === "skipped" ? "warning" : "danger"}>
                    {r.detail}
                  </Badge>
                </div>
              ))}
            </div>
          )}
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      )}
    </Dialog>
  );
}
