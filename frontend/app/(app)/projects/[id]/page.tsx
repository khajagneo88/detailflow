"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ClipboardPaste, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/AuthContext";
import { BatchesSection } from "@/features/batches/BatchesSection";
import { BulkAddRoomsDialog } from "@/features/projects/BulkAddRoomsDialog";
import { projectsApi } from "@/features/projects/api";
import { RoomTable } from "@/features/projects/RoomTable";
import { usersApi } from "@/features/users/api";
import { ApiError } from "@/lib/api-client";
import {
  PRIORITY_LABELS,
  PRIORITY_VARIANTS,
  APARTMENT_STATUS_LABELS,
  APARTMENT_STATUS_VARIANTS,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_VARIANTS,
  formatDate,
} from "@/lib/status";
import type { Apartment, Priority, Project, Room, User } from "@/types";

// Mirrors app/api/deps.py::MANAGEMENT_ROLES (+ Admin, who bypasses every
// role check on the backend) — only these roles can create apartments/rooms,
// so the Add buttons stay hidden for a detailer rather than showing a
// control that would just 403.
const MANAGEMENT_ROLES = new Set(["admin", "manager", "team_leader"]);
const ROOM_PRIORITIES: Priority[] = ["low", "normal", "high", "urgent"];

// Batch creation and room add/remove are Nester-only on the backend
// (require_nester — see app/api/routes/batches.py); everyone else sees the
// Batches tab read-only, same "hide the control rather than show a 403"
// convention as MANAGEMENT_ROLES above.
const NESTER_ROLE = "nester";

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/** Irreversible — cascades through every apartment, room, batch and their
 * time/stage history on the backend (see DELETE /projects/{id}). Requires
 * typing the project number back, same pattern as any other "type X to
 * confirm" destructive-action dialog, since there's no undo. */
function DeleteProjectDialog({
  project,
  onClose,
  onDeleted,
}: {
  project: Project;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmText, setConfirmText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  async function handleDelete() {
    setError(null);
    setIsDeleting(true);
    try {
      await projectsApi.remove(project.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete project.");
      setIsDeleting(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Delete project permanently">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-foreground">
          This permanently deletes <span className="font-medium">{project.name}</span> — every
          apartment, room, comment, stage history and logged time entry goes with it. This can&apos;t
          be undone.
        </p>
        <p className="text-sm text-muted-foreground">
          If you just want it out of the way for now, use <span className="font-medium">Archive</span>{" "}
          instead — it&apos;s reversible and keeps everything.
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="delete-confirm">
            Type <span className="font-mono font-medium">{project.project_number}</span> to confirm
          </Label>
          <Input
            id="delete-confirm"
            autoFocus
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
        </div>
        {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex items-center gap-2">
          <Button
            variant="destructive"
            disabled={confirmText !== project.project_number || isDeleting}
            onClick={handleDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {isDeleting ? "Deleting…" : "Delete permanently"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function AddApartmentDialog({
  projectId,
  open,
  onClose,
  detailers,
  onCreated,
}: {
  projectId: number;
  open: boolean;
  onClose: () => void;
  detailers: User[];
  onCreated: (apartment: Apartment) => void;
}) {
  const [name, setName] = React.useState("");
  const [level, setLevel] = React.useState("");
  const [apartmentType, setApartmentType] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [detailerId, setDetailerId] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  function reset() {
    setName("");
    setLevel("");
    setApartmentType("");
    setDescription("");
    setDetailerId("");
    setDueDate("");
    setNotes("");
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const apartment = await projectsApi.createApartment(projectId, {
        name,
        level: level || null,
        apartment_type: apartmentType || null,
        description: description || null,
        assigned_detailer_id: detailerId ? Number(detailerId) : null,
        due_date: dueDate || null,
        notes: notes || null,
      });
      onCreated(apartment);
      handleClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add apartment.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Add apartment">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="apt-name">Name</Label>
          <Input
            id="apt-name"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Apartment 101"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="apt-level">Level</Label>
            <Input id="apt-level" value={level} onChange={(e) => setLevel(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="apt-type">Type</Label>
            <Input
              id="apt-type"
              value={apartmentType}
              onChange={(e) => setApartmentType(e.target.value)}
              placeholder="2-bed"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="apt-detailer">Detailer</Label>
          <Select id="apt-detailer" value={detailerId} onChange={(e) => setDetailerId(e.target.value)}>
            <option value="">Unassigned</option>
            {detailers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="apt-due">Due date</Label>
          <Input id="apt-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="apt-desc">Description</Label>
          <Textarea id="apt-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="apt-notes">Notes</Label>
          <Textarea id="apt-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Adding…" : "Add apartment"}
          </Button>
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function AddRoomDialog({
  projectId,
  apartments,
  detailers,
  defaultApartmentId,
  onClose,
  onCreated,
}: {
  projectId: number;
  apartments: Apartment[];
  detailers: User[];
  defaultApartmentId: number | null;
  onClose: () => void;
  onCreated: (room: Room) => void;
}) {
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [apartmentId, setApartmentId] = React.useState(
    defaultApartmentId ? String(defaultApartmentId) : ""
  );
  const [detailerId, setDetailerId] = React.useState("");
  const [priority, setPriority] = React.useState<Priority>("normal");
  const [dueDate, setDueDate] = React.useState("");
  const [estimatedHours, setEstimatedHours] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const room = await projectsApi.createRoom(projectId, {
        name,
        code: code || null,
        description: description || null,
        apartment_id: apartmentId ? Number(apartmentId) : null,
        assigned_detailer_id: detailerId ? Number(detailerId) : null,
        priority,
        due_date: dueDate || null,
        estimated_hours: estimatedHours ? Number(estimatedHours) : null,
        notes: notes || null,
      });
      onCreated(room);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add room.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Add room">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="room-name">Name</Label>
          <Input
            id="room-name"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Kitchen"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="room-code">Code (optional)</Label>
            <Input id="room-code" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="room-apartment">Apartment</Label>
            <Select
              id="room-apartment"
              value={apartmentId}
              onChange={(e) => setApartmentId(e.target.value)}
            >
              <option value="">No apartment</option>
              {apartments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="room-detailer">Detailer</Label>
            <Select id="room-detailer" value={detailerId} onChange={(e) => setDetailerId(e.target.value)}>
              <option value="">Unassigned</option>
              {detailers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="room-priority">Priority</Label>
            <Select
              id="room-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              {ROOM_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="room-due">Due date</Label>
            <Input id="room-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="room-hours">Estimated hours</Label>
            <Input
              id="room-hours"
              type="number"
              min={0}
              step="0.5"
              value={estimatedHours}
              onChange={(e) => setEstimatedHours(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="room-desc">Description</Label>
          <Textarea id="room-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="room-notes">Notes</Label>
          <Textarea id="room-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Adding…" : "Add room"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = Number(params.id);
  const { user } = useAuth();
  const canAdd = user !== null && MANAGEMENT_ROLES.has(user.role);
  const canManageBatches = user !== null && user.role === NESTER_ROLE;

  const [project, setProject] = React.useState<Project | null>(null);
  const [apartments, setApartments] = React.useState<Apartment[] | null>(null);
  const [rooms, setRooms] = React.useState<Room[] | null>(null);
  const [detailers, setDetailers] = React.useState<User[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [archiveBusy, setArchiveBusy] = React.useState(false);
  const [archiveError, setArchiveError] = React.useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

  const [apartmentDialogOpen, setApartmentDialogOpen] = React.useState(false);
  // undefined = closed; null = "add room, no apartment preselected"; a
  // number = preselected to that apartment card's "+ Room" button.
  const [roomDialogApartmentId, setRoomDialogApartmentId] = React.useState<
    number | null | undefined
  >(undefined);
  const [bulkDialogOpen, setBulkDialogOpen] = React.useState(false);

  async function handleToggleArchive() {
    if (!project) return;
    setArchiveError(null);
    setArchiveBusy(true);
    try {
      setProject(await projectsApi.setArchived(project.id, !project.is_archived));
    } catch (err) {
      setArchiveError(err instanceof ApiError ? err.message : "Failed to update.");
    } finally {
      setArchiveBusy(false);
    }
  }

  React.useEffect(() => {
    if (!Number.isFinite(projectId)) return;
    Promise.all([
      projectsApi.get(projectId),
      projectsApi.listApartments(projectId),
      projectsApi.listRooms(projectId),
      usersApi.list(),
    ])
      .then(([p, a, r, users]) => {
        setProject(p);
        setApartments(a);
        setRooms(r);
        setDetailers(users.filter((u) => u.role === "detailer"));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load project."));
  }, [projectId]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!project || !apartments || !rooms) {
    return <p className="text-sm text-muted-foreground">Loading project…</p>;
  }

  const unassignedRooms = rooms.filter((r) => r.apartment_id === null);
  const roomsByApartment = new Map<number, Room[]>();
  for (const room of rooms) {
    if (room.apartment_id === null) continue;
    const list = roomsByApartment.get(room.apartment_id) ?? [];
    list.push(room);
    roomsByApartment.set(room.apartment_id, list);
  }

  const roomsRequiringAttention = rooms.filter((r) =>
    ["blocked", "changes_required", "ready_for_review"].includes(r.workflow_status)
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {project.project_number}
          </p>
          <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {project.is_archived && <Badge variant="neutral">Archived</Badge>}
          <Badge variant={PRIORITY_VARIANTS[project.priority]}>
            {PRIORITY_LABELS[project.priority]} priority
          </Badge>
          <Badge variant={PROJECT_STATUS_VARIANTS[project.status]}>
            {PROJECT_STATUS_LABELS[project.status]}
          </Badge>
          {canAdd && (
            <>
              <Button size="sm" variant="outline" disabled={archiveBusy} onClick={handleToggleArchive}>
                {project.is_archived ? (
                  <>
                    <ArchiveRestore className="h-3.5 w-3.5" />
                    Unarchive
                  </>
                ) : (
                  <>
                    <Archive className="h-3.5 w-3.5" />
                    Archive
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-danger/40 text-danger hover:bg-danger-bg"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete permanently
              </Button>
            </>
          )}
        </div>
      </div>

      {archiveError && <p className="text-sm text-danger">{archiveError}</p>}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="rooms">Apartments &amp; Rooms</TabsTrigger>
          <TabsTrigger value="batches">Batches</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-foreground">Details</CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-border">
                <StatRow label="Client" value={project.client_name ?? "—"} />
                <StatRow label="Builder" value={project.builder ?? "—"} />
                <StatRow label="Site address" value={project.site_address ?? "—"} />
                <StatRow
                  label="Project manager"
                  value={project.project_manager?.full_name ?? "—"}
                />
                <StatRow label="Team leader" value={project.team_leader?.full_name ?? "—"} />
                <StatRow
                  label="Assigned detailers"
                  value={
                    project.assigned_detailers.length > 0
                      ? project.assigned_detailers.map((d) => d.full_name).join(", ")
                      : "—"
                  }
                />
                {project.description && (
                  <div className="py-2 text-sm">
                    <p className="mb-1 text-muted-foreground">Description</p>
                    <p>{project.description}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold text-foreground">
                    Key Dates
                  </CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-border">
                  <StatRow label="Start date" value={formatDate(project.start_date)} />
                  <StatRow
                    label="Detailing due"
                    value={formatDate(project.detailing_due_date)}
                  />
                  <StatRow
                    label="Installation date"
                    value={formatDate(project.installation_date)}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold text-foreground">
                    Progress
                  </CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-border">
                  <StatRow label="Apartments" value={project.apartment_count} />
                  <StatRow label="Rooms" value={project.room_count} />
                  <StatRow
                    label="Rooms complete"
                    value={`${project.rooms_complete} / ${project.room_count}`}
                  />
                  <StatRow
                    label="Rooms requiring attention"
                    value={
                      roomsRequiringAttention > 0 ? (
                        <span className="text-danger">{roomsRequiringAttention}</span>
                      ) : (
                        0
                      )
                    }
                  />
                  <StatRow label="Estimated hours" value={project.estimated_hours ?? "—"} />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="rooms">
          <div className="flex flex-col gap-4">
            {canAdd && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setApartmentDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Add apartment
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRoomDialogApartmentId(null)}>
                  <Plus className="h-3.5 w-3.5" />
                  Add room
                </Button>
                <Button size="sm" variant="outline" onClick={() => setBulkDialogOpen(true)}>
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  Bulk add rooms
                </Button>
              </div>
            )}

            {apartments.map((apartment) => (
              <Card key={apartment.id}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="text-sm font-semibold text-foreground">
                      {apartment.name}
                      {apartment.level && (
                        <span className="ml-2 font-normal text-muted-foreground">
                          {apartment.level}
                        </span>
                      )}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {apartment.assigned_detailer?.full_name ?? "Unassigned"} · Due{" "}
                      {formatDate(apartment.due_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={APARTMENT_STATUS_VARIANTS[apartment.status]}>
                      {APARTMENT_STATUS_LABELS[apartment.status]}
                    </Badge>
                    {canAdd && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRoomDialogApartmentId(apartment.id)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Room
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <Separator />
                <CardContent className="p-0">
                  <RoomTable rooms={roomsByApartment.get(apartment.id) ?? []} />
                </CardContent>
              </Card>
            ))}

            {(unassignedRooms.length > 0 || apartments.length === 0) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold text-foreground">
                    {apartments.length > 0 ? "Other Rooms" : "Rooms"}
                  </CardTitle>
                </CardHeader>
                <Separator />
                <CardContent className="p-0">
                  <RoomTable rooms={unassignedRooms} />
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="batches">
          <BatchesSection projectId={project.id} canManage={canManageBatches} />
        </TabsContent>
      </Tabs>

      {canAdd && (
        <AddApartmentDialog
          projectId={project.id}
          open={apartmentDialogOpen}
          onClose={() => setApartmentDialogOpen(false)}
          detailers={detailers}
          onCreated={(apartment) => setApartments((prev) => (prev ? [...prev, apartment] : [apartment]))}
        />
      )}

      {canAdd && roomDialogApartmentId !== undefined && (
        <AddRoomDialog
          key={roomDialogApartmentId ?? "unassigned"}
          projectId={project.id}
          apartments={apartments}
          detailers={detailers}
          defaultApartmentId={roomDialogApartmentId}
          onClose={() => setRoomDialogApartmentId(undefined)}
          onCreated={(room) => {
            setRooms((prev) => (prev ? [...prev, room] : [room]));
            setRoomDialogApartmentId(undefined);
          }}
        />
      )}

      {canAdd && bulkDialogOpen && (
        <BulkAddRoomsDialog
          projectId={project.id}
          apartments={apartments}
          detailers={detailers}
          onClose={() => setBulkDialogOpen(false)}
          onApartmentCreated={(apartment) =>
            setApartments((prev) => (prev ? [...prev, apartment] : [apartment]))
          }
          onRoomCreated={(room) => setRooms((prev) => (prev ? [...prev, room] : [room]))}
        />
      )}

      {canAdd && deleteDialogOpen && (
        <DeleteProjectDialog
          project={project}
          onClose={() => setDeleteDialogOpen(false)}
          onDeleted={() => router.push("/projects")}
        />
      )}
    </div>
  );
}
