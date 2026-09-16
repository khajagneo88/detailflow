"use client";

import * as React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/features/auth/AuthContext";
import { settingsApi } from "@/features/settings/api";
import { ApiError } from "@/lib/api-client";
import { canManageAdminSettings } from "@/lib/roles";
import { ROLE_LABELS } from "@/lib/status";
import { WEEKDAY_OPTIONS } from "@/lib/week";
import type { Weekday } from "@/types";

/** Admin/Team Leader only — mirrors PATCH /settings's own role gate (see
 * app/api/routes/settings.py). Every other role can still read the
 * setting indirectly (it's what the Planning page uses to lay out its
 * grid), just not change it here. */
function WorkspaceSettingsCard() {
  const [weekday, setWeekday] = React.useState<Weekday | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    settingsApi
      .get()
      .then((s) => setWeekday(s.planning_week_start_day))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load settings."));
  }, []);

  async function handleChange(next: Weekday) {
    const previous = weekday;
    setWeekday(next); // optimistic — matches Team page's handleRoleChange pattern
    setSaving(true);
    setError(null);
    try {
      const updated = await settingsApi.update(next);
      setWeekday(updated.planning_week_start_day);
    } catch (err) {
      setWeekday(previous);
      setError(err instanceof ApiError ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-foreground">Workspace</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Label htmlFor="planning-week-start-day">Planning week starts on</Label>
        <Select
          id="planning-week-start-day"
          value={weekday ?? ""}
          disabled={weekday === null || saving}
          onChange={(e) => void handleChange(e.target.value as Weekday)}
        >
          {WEEKDAY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          The Planning page&apos;s weekly grid starts on this day — set it to match whichever day
          your team does its weekly planning meeting on.
        </p>
        {error && <p className="text-xs text-danger">{error}</p>}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Your account and workspace settings.</p>
      </div>
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-foreground">Account</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          <div className="flex justify-between py-2 text-sm">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{user?.full_name}</span>
          </div>
          <div className="flex justify-between py-2 text-sm">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{user?.email}</span>
          </div>
          <div className="flex justify-between py-2 text-sm">
            <span className="text-muted-foreground">Role</span>
            <span className="font-medium">{user ? ROLE_LABELS[user.role] : "—"}</span>
          </div>
        </CardContent>
      </Card>
      {canManageAdminSettings(user?.role) && <WorkspaceSettingsCard />}
    </div>
  );
}
