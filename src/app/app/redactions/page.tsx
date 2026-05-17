"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { EyeOff } from "lucide-react";
import { RedactionsManager } from "@/components/redactions/redactions-manager";
import { hasAnyRole, useAuth, type AppRole } from "@/lib/auth";

const ALLOWED_ROLES: AppRole[] = [
  "hr",
  "exec",
  "gm",
  "gm_ea",
  "director",
  "group_manager",
];

export default function RedactionsPage() {
  const { roles, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !hasAnyRole(roles, ALLOWED_ROLES)) {
      router.replace("/app");
    }
  }, [loading, roles, router]);

  if (loading || !hasAnyRole(roles, ALLOWED_ROLES)) return null;

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-muted p-2">
          <EyeOff className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
            My redactions
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Mask identifying words in submission content so you can review
            feedback without bias. Keywords only affect what <em>you</em>{" "}
            see — other reviewers see the unmasked text.
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4 md:p-6">
        <RedactionsManager />
      </div>

      <div className="rounded-md border bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1">
        <p>
          <strong className="text-foreground">Where they apply:</strong>{" "}
          Inbox content preview, submission detail, and the Decisions page.
          Exports use the underlying unmasked text.
        </p>
        <p>
          <strong className="text-foreground">Privacy:</strong> Your keyword
          list is only visible to you. Matching is case-insensitive and
          exact-substring; minimum 2 characters.
        </p>
      </div>
    </div>
  );
}
