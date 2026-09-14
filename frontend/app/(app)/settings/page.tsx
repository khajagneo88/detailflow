"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/AuthContext";
import { ROLE_LABELS } from "@/lib/status";

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
    </div>
  );
}
