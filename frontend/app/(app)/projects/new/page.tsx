"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { projectsApi } from "@/features/projects/api";
import { usersApi } from "@/features/users/api";
import { ApiError } from "@/lib/api-client";
import { PRIORITY_LABELS, PROJECT_STATUS_LABELS } from "@/lib/status";
import type { Priority, ProjectStatus, User } from "@/types";

const PRIORITIES: Priority[] = ["low", "normal", "high", "urgent"];
const STATUSES: ProjectStatus[] = [
  "not_started",
  "in_progress",
  "waiting_for_information",
  "waiting_for_check_measure",
  "under_review",
  "ready_for_production",
  "on_hold",
  "complete",
];

export default function NewProjectPage() {
  const router = useRouter();
  const [users, setUsers] = React.useState<User[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const [form, setForm] = React.useState({
    project_number: "",
    name: "",
    client_name: "",
    builder: "",
    site_address: "",
    project_manager: "",
    description: "",
    priority: "normal" as Priority,
    status: "not_started" as ProjectStatus,
    team_leader_id: "",
    start_date: "",
    detailing_due_date: "",
    installation_date: "",
    estimated_hours: "",
    notes: "",
  });
  const [detailerIds, setDetailerIds] = React.useState<Set<number>>(new Set());

  React.useEffect(() => {
    usersApi.list().then(setUsers);
  }, []);

  const leaders = users?.filter((u) => u.role === "manager" || u.role === "team_leader") ?? [];
  const detailers = users?.filter((u) => u.role === "detailer") ?? [];

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleDetailer(id: number) {
    setDetailerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const project = await projectsApi.create({
        project_number: form.project_number,
        name: form.name,
        client_name: form.client_name || undefined,
        builder: form.builder || undefined,
        site_address: form.site_address || undefined,
        project_manager: form.project_manager || undefined,
        description: form.description || undefined,
        priority: form.priority,
        status: form.status,
        team_leader_id: form.team_leader_id ? Number(form.team_leader_id) : null,
        start_date: form.start_date || null,
        detailing_due_date: form.detailing_due_date || null,
        installation_date: form.installation_date || null,
        estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
        notes: form.notes || undefined,
        assigned_detailer_ids: Array.from(detailerIds),
      });
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create project.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">New Project</h1>
        <p className="text-sm text-muted-foreground">Set up a new detailing project.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-foreground">Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project_number">Project number</Label>
              <Input
                id="project_number"
                required
                value={form.project_number}
                onChange={(e) => update("project_number", e.target.value)}
                placeholder="P-1003"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Project name</Label>
              <Input
                id="name"
                required
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="client_name">Client</Label>
              <Input
                id="client_name"
                value={form.client_name}
                onChange={(e) => update("client_name", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="builder">Builder</Label>
              <Input
                id="builder"
                value={form.builder}
                onChange={(e) => update("builder", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="site_address">Site address</Label>
              <Input
                id="site_address"
                value={form.site_address}
                onChange={(e) => update("site_address", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project_manager">Project manager</Label>
              <Input
                id="project_manager"
                value={form.project_manager}
                onChange={(e) => update("project_manager", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="team_leader">Team leader</Label>
              <Select
                id="team_leader"
                value={form.team_leader_id}
                onChange={(e) => update("team_leader_id", e.target.value)}
              >
                <option value="">Unassigned</option>
                {leaders.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-foreground">
              Status &amp; Dates
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="priority">Priority</Label>
              <Select
                id="priority"
                value={form.priority}
                onChange={(e) => update("priority", e.target.value as Priority)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="status">Status</Label>
              <Select
                id="status"
                value={form.status}
                onChange={(e) => update("status", e.target.value as ProjectStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PROJECT_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="estimated_hours">Estimated hours</Label>
              <Input
                id="estimated_hours"
                type="number"
                min={0}
                step="0.5"
                value={form.estimated_hours}
                onChange={(e) => update("estimated_hours", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="start_date">Start date</Label>
              <Input
                id="start_date"
                type="date"
                value={form.start_date}
                onChange={(e) => update("start_date", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="detailing_due_date">Detailing due</Label>
              <Input
                id="detailing_due_date"
                type="date"
                value={form.detailing_due_date}
                onChange={(e) => update("detailing_due_date", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="installation_date">Installation date</Label>
              <Input
                id="installation_date"
                type="date"
                value={form.installation_date}
                onChange={(e) => update("installation_date", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-foreground">
              Assigned Detailers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {detailers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No detailer accounts yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {detailers.map((u) => {
                  const selected = detailerIds.has(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleDetailer(u.id)}
                      className={
                        selected
                          ? "rounded-full border border-primary bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
                          : "rounded-full border border-border bg-surface px-3 py-1 text-sm text-foreground hover:bg-surface-muted"
                      }
                    >
                      {u.full_name}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating…" : "Create project"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push("/projects")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
