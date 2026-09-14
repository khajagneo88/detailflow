"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/features/auth/AuthContext";

export default function RootPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (isLoading) return;
    router.replace(user ? "/dashboard" : "/login");
  }, [isLoading, user, router]);

  return null;
}
