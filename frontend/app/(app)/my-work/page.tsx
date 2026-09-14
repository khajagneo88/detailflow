"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, PlayCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/features/auth/AuthContext";
import { roomsApi, workflowStagesApi } from "@/features/rooms/api";
import { ApiError } from "@/lib/api-client";
import { BUCKET_META, BUCKET_ORDER, Bucket, bucketFor, getReadyForCheckTarget } from "@/lib/room-workflow";
import {
  PRIORITY_LABELS,
  PRIORITY_VARIANTS,
  ROOM_WORKFLOW_STATUS_LABELS,
  ROOM_WORKFLOW_STATUS_VARIANTS,
  formatDate,
} from "@/lib/status";
import type { Room, WorkflowStage } from "@/types";

function RoomRow({
  room,
  stages,
  isDetailer,
  onChanged,
}: {
  room: Room;
  stages: WorkflowStage[];
  isDetailer: boolean;
  onChanged: (room: Room) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const readyTarget = getReadyForCheckTarget(room, stages);

  async function handleStart() {
    setBusy(true);
    setError(null);
    try {
      onChanged(await roomsApi.updateStatus(room.id, "in_progress"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReady() {
    if (!readyTarget) return;
    setBusy(true);
    setError(null);
    try {
      await roomsApi.createStageTransition(room.id, { to_stage_key: readyTarget.key });
      onChanged(await roomsApi.get(room.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <Link
          href={`/rooms/${room.id}`}
          className="flex items-center gap-1.5 font-medium hover:text-primary hover:underline"
        >
          {room.workflow_status === "blocked" && (
            <AlertTriangle className="h-3.5 w-3.5 text-danger" />
          )}
          {room.name}
        </Link>
        <p className="text-xs text-muted-foreground">
          {room.project_name}
          {room.apartment_name && <> · {room.apartment_name}</>} · {room.workflow_stage.name}
        </p>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={PRIORITY_VARIANTS[room.priority]}>{PRIORITY_LABELS[room.priority]}</Badge>
        <Badge variant={ROOM_WORKFLOW_STATUS_VARIANTS[room.workflow_status]}>
          {ROOM_WORKFLOW_STATUS_LABELS[room.workflow_status]}
        </Badge>
        <span className="text-xs text-muted-foreground">Due {formatDate(room.due_date)}</span>

        {isDetailer && room.workflow_status === "not_started" && (
          <Button size="sm" variant="outline" disabled={busy} onClick={handleStart}>
            <PlayCircle className="h-3.5 w-3.5" />
            Start
          </Button>
        )}
        {isDetailer && readyTarget && (
          <Button size="sm" variant="outline" disabled={busy} onClick={handleReady}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            Ready for Check
          </Button>
        )}
      </div>
    </div>
  );
}

export default function MyWorkPage() {
  const { user } = useAuth();
  const isDetailer = user?.role === "detailer";

  const [rooms, setRooms] = React.useState<Room[] | null>(null);
  const [stages, setStages] = React.useState<WorkflowStage[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    Promise.all([roomsApi.listMine(), workflowStagesApi.list()])
      .then(([r, s]) => {
        setRooms(r);
        setStages(s);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load."));
  }, []);

  function handleChanged(updated: Room) {
    setRooms((prev) => prev?.map((r) => (r.id === updated.id ? updated : r)) ?? null);
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!rooms || !stages) {
    return <p className="text-sm text-muted-foreground">Loading your work…</p>;
  }

  const grouped = new Map<Bucket, Room[]>();
  for (const room of rooms) {
    const bucket = bucketFor(room);
    const list = grouped.get(bucket) ?? [];
    list.push(room);
    grouped.set(bucket, list);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">My Work</h1>
        <p className="text-sm text-muted-foreground">
          Every room assigned to you, ordered by what needs you first.
        </p>
      </div>

      {rooms.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nothing assigned to you yet.
          </CardContent>
        </Card>
      )}

      {BUCKET_ORDER.map((bucket) => {
        const bucketRooms = grouped.get(bucket);
        if (!bucketRooms || bucketRooms.length === 0) return null;
        return (
          <div key={bucket} className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                {BUCKET_META[bucket].title}
              </h2>
              <span className="text-xs text-muted-foreground">
                {bucketRooms.length} · {BUCKET_META[bucket].hint}
              </span>
            </div>
            <Card>
              <CardContent className="p-0">
                {bucketRooms.map((room) => (
                  <RoomRow
                    key={room.id}
                    room={room}
                    stages={stages}
                    isDetailer={isDetailer}
                    onChanged={handleChanged}
                  />
                ))}
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
