"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

import { useAuditLog, useAuditFacets, type AuditEntry, type AuditFilters } from "@/lib/audit";
import { useAuth, isAdminOnly } from "@/lib/auth";

const ACTION_TONE: Record<string, string> = {
  create: "bg-info-subtle text-info border-info/30",
  update: "bg-warning-subtle text-warning border-warning/30",
  delete: "bg-danger-subtle text-danger border-danger/30",
  classify: "bg-info-subtle text-info border-info/30",
  draft: "bg-info-subtle text-info border-info/30",
  review: "bg-warning-subtle text-warning border-warning/30",
  approve: "bg-success-subtle text-success border-success/30",
  send: "bg-success-subtle text-success border-success/30",
  decision: "bg-warning-subtle text-warning border-warning/30",
  merge: "bg-warning-subtle text-warning border-warning/30",
};

function actionToneFor(action: string) {
  const key = Object.keys(ACTION_TONE).find((k) => action.toLowerCase().includes(k));
  return key ? ACTION_TONE[key] : "bg-secondary text-secondary-foreground border-border";
}

export default function AuditPage() {
  const [filters, setFilters] = useState<AuditFilters>({});
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const { roles } = useAuth();
  const adminOnly = isAdminOnly(roles);

  const { data: facets } = useAuditFacets();
  const { data: rows, isLoading } = useAuditLog(filters);

  const actionOptions = useMemo(() => facets?.actions ?? [], [facets]);
  const entityOptions = useMemo(() => facets?.entityTypes ?? [], [facets]);
  const userOptions = useMemo(() => facets?.users ?? [], [facets]);

  const reset = () => setFilters({});

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Audit trail</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every classification, draft, approval, decision, and theme change is recorded here.
        </p>
        {adminOnly ? (
          <p className="mt-2 text-xs rounded-md border border-warning/30 bg-warning-subtle text-warning px-3 py-2 inline-block">
            Submission content, names, and classifications are redacted in your view.
          </p>
        ) : null}
      </header>

      <div className="rounded-md border bg-card p-4 mb-4">
        <div className="grid gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <Label htmlFor="audit-search" className="text-xs font-semibold">
              Search
            </Label>
            <div className="relative mt-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="audit-search"
                placeholder="Search action, entity, actor, details"
                className="pl-8"
                value={filters.search ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold">Action</Label>
            <Select
              value={filters.action ?? "all"}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, action: v === "all" ? undefined : v }))
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {actionOptions.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-semibold">Entity</Label>
            <Select
              value={filters.entityType ?? "all"}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, entityType: v === "all" ? undefined : v }))
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="All entities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entities</SelectItem>
                {entityOptions.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-semibold">User</Label>
            <Select
              value={filters.userId ?? "all"}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, userId: v === "all" ? undefined : v }))
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="All users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {userOptions.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="audit-from" className="text-xs font-semibold">
              From
            </Label>
            <Input
              id="audit-from"
              type="date"
              className="mt-1"
              value={filters.from ? filters.from.slice(0, 10) : ""}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  from: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                }))
              }
            />
          </div>
          <div>
            <Label htmlFor="audit-to" className="text-xs font-semibold">
              To
            </Label>
            <Input
              id="audit-to"
              type="date"
              className="mt-1"
              value={filters.to ? filters.to.slice(0, 10) : ""}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  to: e.target.value
                    ? new Date(e.target.value + "T23:59:59").toISOString()
                    : undefined,
                }))
              }
            />
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <Button variant="ghost" size="sm" onClick={reset}>
            Clear filters
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Reference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : (rows ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12">
                  <p className="text-sm font-semibold">No audit entries match</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Try broadening the date range or clearing the filters.
                  </p>
                  <Button variant="ghost" size="sm" className="mt-3" onClick={reset}>
                    Clear filters
                  </Button>
                </TableCell>
              </TableRow>
            ) : (
              (rows ?? []).map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {format(new Date(r.created_at), "d MMM yyyy, HH:mm")}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.actor_name ?? r.actor_email ?? (
                      <span className="text-muted-foreground">System</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`rounded-full ${actionToneFor(r.action)}`}>
                      {r.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{r.entity_type}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {r.entity_id ? r.entity_id.slice(0, 8) : ""}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {rows && rows.length > 0 ? (
        <p className="text-xs text-muted-foreground mt-3">
          Showing {rows.length} most recent {rows.length === 1 ? "entry" : "entries"}.
        </p>
      ) : null}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Audit entry</SheetTitle>
            <SheetDescription>
              {selected ? format(new Date(selected.created_at), "EEEE d MMMM yyyy, HH:mm") : ""}
            </SheetDescription>
          </SheetHeader>
          {selected ? (
            <dl className="mt-6 space-y-4 text-sm">
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">Actor</dt>
                <dd className="mt-1">
                  {selected.actor_name ?? selected.actor_email ?? "System"}
                  {selected.actor_email && selected.actor_name ? (
                    <span className="text-muted-foreground"> ({selected.actor_email})</span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">Action</dt>
                <dd className="mt-1">
                  <Badge variant="outline" className={`rounded-full ${actionToneFor(selected.action)}`}>
                    {selected.action}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">Entity</dt>
                <dd className="mt-1">
                  {selected.entity_type}
                  {selected.entity_id ? (
                    <span className="font-mono text-xs text-muted-foreground"> · {selected.entity_id}</span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">Details</dt>
                <dd className="mt-1">
                  <pre className="rounded-sm border bg-muted p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(selected.details ?? {}, null, 2)}
                  </pre>
                </dd>
              </div>
            </dl>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
