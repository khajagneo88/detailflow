"use client";

import * as React from "react";
import { UserPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PresenceDot } from "@/components/ui/presence-dot";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/AuthContext";
import { reportsApi } from "@/features/reports/api";
import { RoomTable } from "@/features/projects/RoomTable";
import { usersApi } from "@/features/users/api";
import { ApiError } from "@/lib/api-client";
import { presenceStatus } from "@/lib/presence";
import { bucketFor, compareRoomUrgency } from "@/lib/room-workflow";
import { ROLE_LABELS } from "@/lib/status";
import type { ActiveTimerItem, Room, User, UserRole } from "@/types";

const ROLE_OPTIONS: UserRole[] = [
  "admin",
  "manager",
  "team_leader",
  "project_manager",
  "detailer",
  "nester",
];

/** One detailer's current (non-complete) jobs, sorted by urgency, plus a
 * quick attention/overdue count for the card header — everything a manager
 * needs to answer "what is this person working on right now" without
 * opening My Work as them. Rooms come from GET /reports/rooms (already
 * loaded once for every detailer, not per-card) grouped client-side by
 * assigned_detailer_id. */
function WorkloadCard({
  detailer,
  rooms,
  hasActiveTimer,
}: {
  detailer: User;
  rooms: Room[];
  hasActiveTimer: boolean;
}) {
  const currentRooms = rooms.filter((r) => r.workflow_status !== "complete").sort(compareRoomUrgency);
  const completeCount = rooms.length - currentRooms.length;
  const attentionCount = currentRooms.filter((r) => bucketFor(r) === "attention").length;
  const overdueCount = currentRooms.filter((r) => bucketFor(r) === "overdue").length;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <PresenceDot status={presenceStatus(detailer, hasActiveTimer)} />
            {detailer.full_name}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {currentRooms.length} current job{currentRooms.length === 1 ? "" : "s"}
            {completeCount > 0 && ` · ${completeCount} complete`}
            {!detailer.is_active && " · Deactivated"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {attentionCount > 0 && (
            <Badge variant="danger">
              {attentionCount} need{attentionCount === 1 ? "s" : ""} attention
            </Badge>
          )}
          {overdueCount > 0 && (
            <Badge variant="warning">
              {overdueCount} overdue
            </Badge>
          )}
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="p-0">
        {currentRooms.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">Nothing currently assigned.</p>
        ) : (
          <RoomTable rooms={currentRooms} showDetailer={false} showProject />
        )}
      </CardContent>
    </Card>
  );
}

function WorkloadTab({
  detailers,
  rooms,
  activeTimerUserIds,
}: {
  detailers: User[];
  rooms: Room[];
  activeTimerUserIds: Set<number>;
}) {
  if (detailers.length === 0) {
    return <p className="text-sm text-muted-foreground">No detailer accounts yet.</p>;
  }

  const roomsByDetailer = new Map<number, Room[]>();
  for (const room of rooms) {
    if (!room.assigned_detailer) continue;
    const list = roomsByDetailer.get(room.assigned_detailer.id) ?? [];
    list.push(room);
    roomsByDetailer.set(room.assigned_detailer.id, list);
  }

  return (
    <div className="flex flex-col gap-4">
      {detailers.map((detailer) => (
        <WorkloadCard
          key={detailer.id}
          detailer={detailer}
          rooms={roomsByDetailer.get(detailer.id) ?? []}
          hasActiveTimer={activeTimerUserIds.has(detailer.id)}
        />
      ))}
    </div>
  );
}

function NewUserDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (user: User) => void;
}) {
  const [email, setEmail] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [role, setRole] = React.useState<UserRole>("detailer");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  function reset() {
    setEmail("");
    setFullName("");
    setRole("detailer");
    setPassword("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const user = await usersApi.create({ email, full_name: fullName, role, password });
      onCreated(user);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create user.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Add team member"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-user-name">Full name</Label>
          <Input
            id="new-user-name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-user-email">Email</Label>
          <Input
            id="new-user-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-user-role">Role</Label>
          <Select
            id="new-user-role"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-user-password">Temporary password</Label>
          <Input
            id="new-user-password"
            type="text"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Share this with them directly"
          />
        </div>
        {error && (
          <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating…" : "Create account"}
        </Button>
      </form>
    </Dialog>
  );
}

export default function TeamPage() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";

  const [users, setUsers] = React.useState<User[] | null>(null);
  const [rooms, setRooms] = React.useState<Room[] | null>(null);
  const [activeTimers, setActiveTimers] = React.useState<ActiveTimerItem[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [savingId, setSavingId] = React.useState<number | null>(null);

  const loadUsers = React.useCallback(() => {
    usersApi
      .list()
      .then(setUsers)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load team."));
  }, []);

  const loadActiveTimers = React.useCallback(() => {
    reportsApi
      .activeTimers()
      .then(setActiveTimers)
      .catch(() => {
        // Best-effort — a failed poll just means presence dots stay at
        // their last-known state until the next successful one, not an
        // error worth surfacing over the rest of the page.
      });
  }, []);

  React.useEffect(loadUsers, [loadUsers]);
  React.useEffect(loadActiveTimers, [loadActiveTimers]);

  // Loaded once for the whole page (not per Workload card) — every room,
  // across every project, is the input the tab groups by detailer.
  React.useEffect(() => {
    reportsApi
      .rooms()
      .then(setRooms)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load workload."));
  }, []);

  // Presence (last_seen_at + active timer) changes on its own over time —
  // re-poll both every 30s so the dots on this page stay roughly live
  // instead of only reflecting the moment the page was opened, mirroring
  // TimeTrackingContext's poll interval elsewhere in the app.
  React.useEffect(() => {
    const interval = setInterval(() => {
      loadUsers();
      loadActiveTimers();
    }, 30_000);
    return () => clearInterval(interval);
  }, [loadUsers, loadActiveTimers]);

  const detailers = users?.filter((u) => u.role === "detailer") ?? [];
  const activeTimerUserIds = new Set(activeTimers.map((t) => t.user_id));

  async function handleRoleChange(user: User, role: UserRole) {
    setSavingId(user.id);
    try {
      const updated = await usersApi.update(user.id, { role });
      setUsers((prev) => prev?.map((u) => (u.id === updated.id ? updated : u)) ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update role.");
    } finally {
      setSavingId(null);
    }
  }

  async function handleToggleActive(user: User) {
    setSavingId(user.id);
    try {
      const updated = await usersApi.update(user.id, { is_active: !user.is_active });
      setUsers((prev) => prev?.map((u) => (u.id === updated.id ? updated : u)) ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update status.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">
            Everyone with access to DetailFlow, and what every detailer currently has on.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setDialogOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Add team member
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Tabs defaultValue="team">
        <TabsList>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="workload">Workload</TabsTrigger>
        </TabsList>

        <TabsContent value="team">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-1.5">
                          <PresenceDot
                            status={presenceStatus(user, activeTimerUserIds.has(user.id))}
                          />
                          {user.full_name}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>
                        {isAdmin ? (
                          <Select
                            value={user.role}
                            disabled={savingId === user.id}
                            onChange={(e) => handleRoleChange(user, e.target.value as UserRole)}
                            className="h-8 w-40"
                          >
                            {ROLE_OPTIONS.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          ROLE_LABELS[user.role]
                        )}
                      </TableCell>
                      <TableCell>
                        {isAdmin ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={savingId === user.id || user.id === currentUser?.id}
                            onClick={() => handleToggleActive(user)}
                          >
                            {user.is_active ? "Active" : "Deactivated"}
                          </Button>
                        ) : (
                          <Badge variant={user.is_active ? "success" : "neutral"}>
                            {user.is_active ? "Active" : "Deactivated"}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workload">
          {!rooms ? (
            <p className="text-sm text-muted-foreground">Loading workload…</p>
          ) : (
            <WorkloadTab
              detailers={detailers}
              rooms={rooms}
              activeTimerUserIds={activeTimerUserIds}
            />
          )}
        </TabsContent>
      </Tabs>

      <NewUserDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={(user) => setUsers((prev) => (prev ? [...prev, user] : [user]))}
      />
    </div>
  );
}
