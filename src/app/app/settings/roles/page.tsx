"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useAuth, hasAnyRole, ALL_ROLES, ROLE_LABELS } from "@/lib/auth";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PERMISSIONS: Record<
  string,
  { submissions: string; themes: string; approvals: string; users: string }
> = {
  admin: {
    submissions: "None — strict conflict-of-interest boundary",
    themes: "None",
    approvals: "None",
    users: "Full",
  },
  gm: { submissions: "Full", themes: "Full", approvals: "Final approver", users: "None" },
  gm_ea: {
    submissions: "Full",
    themes: "Full",
    approvals: "Drafts only (GM approves)",
    users: "None",
  },
  director: { submissions: "Full", themes: "Full", approvals: "Own division", users: "None" },
  group_manager: {
    submissions: "Own portfolio only",
    themes: "View",
    approvals: "None",
    users: "None",
  },
  hr: { submissions: "Full", themes: "Full", approvals: "Drafts only", users: "None" },
  exec: {
    submissions: "View (redacted)",
    themes: "View",
    approvals: "View",
    users: "None",
  },
};

export default function RolesPage() {
  const { roles, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !hasAnyRole(roles, ["admin"])) router.replace("/app");
  }, [loading, roles, router]);

  if (!hasAnyRole(roles, ["admin"])) return null;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-muted p-2">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Read-only role permissions. Not editable in MVP.
          </p>
        </div>
      </div>

      <SettingsTabs />

      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Submissions</TableHead>
              <TableHead>Themes</TableHead>
              <TableHead>Response approval</TableHead>
              <TableHead>User management</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ALL_ROLES.map((r) => {
              const p = PERMISSIONS[r];
              return (
                <TableRow key={r}>
                  <TableCell className="font-medium">{ROLE_LABELS[r]}</TableCell>
                  <TableCell className="text-sm">{p.submissions}</TableCell>
                  <TableCell className="text-sm">{p.themes}</TableCell>
                  <TableCell className="text-sm">{p.approvals}</TableCell>
                  <TableCell className="text-sm">{p.users}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-lg border bg-warning-subtle/40 border-warning/30 p-4 text-sm">
        <p className="font-semibold mb-1">Admin boundary</p>
        <p className="text-muted-foreground">
          The administrator role has zero access to submission content, submitter PII,
          classifications, themes, response drafts, or decisions. This is enforced at the
          database level via Row-Level Security and cannot be bypassed by direct API calls.
        </p>
      </div>
    </div>
  );
}
