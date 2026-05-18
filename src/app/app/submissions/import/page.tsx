"use client";

import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { ImportWizard } from "@/components/submissions/import/import-wizard";

export default function ImportSubmissionsPage() {
  const { roles, loading } = useAuth();
  const canIngest = hasAnyRole(roles, ["admin", "hr"]);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="space-y-2">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-2 h-8 text-muted-foreground"
        >
          <Link href="/app/inbox">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back to inbox
          </Link>
        </Button>
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
            Import submissions
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            Bring in feedback from a spreadsheet, paste from another tool, or drop a CSV / Excel
            file. Imported rows land as <strong>new</strong> in the inbox so you can
            review and classify them.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border bg-card p-8 text-sm text-muted-foreground">
          Loading…
        </div>
      ) : !canIngest ? (
        <div className="rounded-lg border bg-card p-8 text-sm text-muted-foreground flex items-start gap-3">
          <Lock className="h-4 w-4 mt-0.5 text-muted-foreground" />
          <div>
            <div className="font-medium text-foreground">Not available for your role</div>
            <p className="mt-1">
              Importing submissions requires <strong>admin</strong> or{" "}
              <strong>hr</strong> access. Ask your administrator if you need this.
            </p>
          </div>
        </div>
      ) : (
        <ImportWizard />
      )}
    </div>
  );
}
