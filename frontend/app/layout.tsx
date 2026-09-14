import type { Metadata } from "next";
import "./globals.css";

import { AuthProvider } from "@/features/auth/AuthContext";

export const metadata: Metadata = {
  title: "DetailFlow",
  description: "Workflow management for Cabinet Vision detailing teams.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
