"use client";

import * as React from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { projectsApi } from "@/features/projects/api";
import { ApiError } from "@/lib/api-client";
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_VARIANTS,
  formatDate,
} from "@/lib/status";
import type { ProjectListItem } from "@/types";

/**
 * Team Leader dashboard — MVP scope. The four cards below are computed from
 * data the API already returns (project status + due dates). Cards that
 * need features not built yet (blockers, the checking queue, time totals)
 * are intentionally shown as "—" rather than faked — see
 * docs/ARCHITECTURE.md §9 roadmap.
 */
export default function DashboardPage() {
  const [projects, setProjects] = React.useState<ProjectListItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    projectsApi
      .list()
      .then(setProjects)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load."));
  }, []);

  if (error) {
    return <p className="text-sm text-danger">{error}</p>;
  }

  if (!projects) {
    return <p className="text-sm text-muted-foreground">Loading dashboard…</p>;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeProjects = projects.filter((p) => p.status !== "complete");
  const overdueProjects = projects.filter(
    (p) =>
      p.status !== "complete" &&
      p.detailing_due_date &&
      new Date(p.detailing_due_date) < today
  );
  const readyForProduction = projects.filter((p) => p.status === "ready_for_production");
  const waitingCheckMeasure = projects.filter(
    (p) => p.status === "waiting_for_check_measure"
  );

  const cards: { label: string; value: number | string }[] = [
    { label: "Active Projects", value: activeProjects.length },
    { label: "Overdue Projects", value: overdueProjects.length },
    { label: "Waiting for Check Measure", value: waitingCheckMeasure.length },
    { label: "Awaiting Team Leader Check", value: "—" },
    { label: "Changes Required", value: "—" },
    { label: "Blocked Items", value: "—" },
    { label: "Ready for Production", value: readyForProduction.length },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Operational overview of the detailing department.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="gap-0.5 pb-1">
              <CardTitle>{card.label}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tabular-nums">
              {card.value}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-foreground">
            Active Projects
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Team Leader</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeProjects.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No active projects.
                  </TableCell>
                </TableRow>
              )}
              {activeProjects.map((project) => {
                const isOverdue =
                  project.detailing_due_date && new Date(project.detailing_due_date) < today;
                return (
                  <TableRow key={project.id}>
                    <TableCell>
                      <Link
                        href={`/projects/${project.id}`}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {project.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{project.project_number}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {project.room_count > 0
                        ? `${project.rooms_complete}/${project.room_count} rooms complete`
                        : "—"}
                    </TableCell>
                    <TableCell>{project.team_leader?.full_name ?? "—"}</TableCell>
                    <TableCell className={isOverdue ? "font-medium text-danger" : undefined}>
                      {formatDate(project.detailing_due_date)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={PROJECT_STATUS_VARIANTS[project.status]}>
                        {PROJECT_STATUS_LABELS[project.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
