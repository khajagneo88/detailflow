import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PRIORITY_LABELS,
  PRIORITY_VARIANTS,
  ROOM_WORKFLOW_STATUS_LABELS,
  ROOM_WORKFLOW_STATUS_VARIANTS,
  formatDate,
  stageVariant,
} from "@/lib/status";
import type { Room } from "@/types";

/** Rooms table used both under an apartment and for a project's unassigned
 * rooms — see spec §35 (Apartments & Rooms UI). Each row links through to
 * the room detail page. `showDetailer` defaults on; the Team page's
 * Workload tab turns it off since every row in a given table is already
 * that one detailer's, and repeating their name in every row would just be
 * noise. `showProject` defaults off (a project-scoped table doesn't need
 * it) — the Workload tab turns it on instead, since its rooms span every
 * project at once. */
export function RoomTable({
  rooms,
  showDetailer = true,
  showProject = false,
}: {
  rooms: Room[];
  showDetailer?: boolean;
  showProject?: boolean;
}) {
  if (rooms.length === 0) {
    return <p className="px-1 py-3 text-sm text-muted-foreground">No rooms yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Room</TableHead>
          {showProject && <TableHead>Project</TableHead>}
          {showDetailer && <TableHead>Detailer</TableHead>}
          <TableHead>Stage</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Due Date</TableHead>
          <TableHead>Progress</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rooms.map((room) => (
          <TableRow key={room.id} className="cursor-pointer">
            <TableCell className="font-medium">
              <Link
                href={`/rooms/${room.id}`}
                className="flex items-center gap-1.5 hover:text-primary hover:underline"
              >
                {room.workflow_status === "blocked" && (
                  <AlertTriangle className="h-3.5 w-3.5 text-danger" />
                )}
                {room.name}
              </Link>
            </TableCell>
            {showProject && (
              <TableCell className="text-muted-foreground">
                {room.project_name}
                {room.apartment_name && ` · ${room.apartment_name}`}
              </TableCell>
            )}
            {showDetailer && (
              <TableCell className="text-muted-foreground">
                {room.assigned_detailer?.full_name ?? "Unassigned"}
              </TableCell>
            )}
            <TableCell>
              <Badge variant={stageVariant(room.workflow_stage.key)}>
                {room.workflow_stage.name}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant={ROOM_WORKFLOW_STATUS_VARIANTS[room.workflow_status]}>
                {ROOM_WORKFLOW_STATUS_LABELS[room.workflow_status]}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant={PRIORITY_VARIANTS[room.priority]}>
                {PRIORITY_LABELS[room.priority]}
              </Badge>
            </TableCell>
            <TableCell>{formatDate(room.due_date)}</TableCell>
            <TableCell className="w-32">
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${room.progress}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {room.progress}%
                </span>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
