"use client";

import * as React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/features/auth/AuthContext";
import { projectsApi } from "@/features/projects/api";
import { ApiError } from "@/lib/api-client";
import { canManage } from "@/lib/roles";
import {
  PRIORITY_LABELS,
  PRIORITY_VARIANTS,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_VARIANTS,
  formatDate,
} from "@/lib/status";
import type { ProjectListItem } from "@/types";

export default function ProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = React.useState<ProjectListItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showArchived, setShowArchived] = React.useState(false);

  React.useEffect(() => {
    projectsApi
      .list(showArchived)
      .then(setProjects)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load."));
  }, [showArchived]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Every active detailing project across the team.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border"
            />
            Show archived
          </label>
          {canManage(user?.role) && (
            <Link href="/projects/new" className={buttonVariants({})}>
              <Plus className="h-4 w-4" />
              New Project
            </Link>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {!error && !projects && (
        <p className="text-sm text-muted-foreground">Loading projects…</p>
      )}

      {projects && projects.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No projects yet.
          </CardContent>
        </Card>
      )}

      {projects && projects.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Team Leader</TableHead>
                  <TableHead>Rooms</TableHead>
                  <TableHead>Due Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => (
                  <TableRow key={project.id} className="cursor-pointer">
                    <TableCell>
                      <Link
                        href={`/projects/${project.id}`}
                        className="flex items-center gap-1.5 font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {project.name}
                        {project.is_archived && <Badge variant="neutral">Archived</Badge>}
                      </Link>
                      <p className="text-xs text-muted-foreground">{project.project_number}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {project.client_name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={PRIORITY_VARIANTS[project.priority]}>
                        {PRIORITY_LABELS[project.priority]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={PROJECT_STATUS_VARIANTS[project.status]}>
                        {PROJECT_STATUS_LABELS[project.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>{project.team_leader?.full_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {project.room_count > 0
                        ? `${project.rooms_complete}/${project.room_count}`
                        : "—"}
                    </TableCell>
                    <TableCell>{formatDate(project.detailing_due_date)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
