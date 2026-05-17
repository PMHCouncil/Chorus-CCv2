"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Search,
  Inbox,
  UserPlus,
  Sparkles,
  Archive,
  ArchiveRestore,
  X,
  SlidersHorizontal,
} from "lucide-react";
import { format as fmt } from "date-fns";
import { ExportMenu } from "@/components/export-menu";
import { exportCSV, exportPDF, type ExportColumn } from "@/lib/export";
import type { Submission } from "@/lib/submissions";
import { NewSubmissionDialog } from "@/components/submissions/new-submission-dialog";
import { SubmissionDetailSheet } from "@/components/submissions/submission-detail-sheet";
import {
  SOURCE_LABELS,
  STATUS_LABELS,
  useSubmissions,
  useStaffMembers,
  useBulkAssign,
  useBulkArchive,
  useBulkClassify,
  type SubmissionSource,
  type SubmissionStatus,
  type ArchivedFilter,
} from "@/lib/submissions";
import {
  DIVISION_OPTIONS,
  FEEDBACK_TYPE_OPTIONS,
  PRINCIPLE_TAG_OPTIONS,
} from "@/lib/classify";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { applyRedactions, useExecRedactions } from "@/lib/decisions";

export default function InboxPage() {
  const searchParamsObj = useSearchParams();
  const initialAssignee = searchParamsObj.get("assignee") ?? "all";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SubmissionStatus | "all">("all");
  const [source, setSource] = useState<SubmissionSource | "all">("all");
  const [division, setDivision] = useState<string>("all");
  const [feedbackType, setFeedbackType] = useState<string>("all");
  const [principleTag, setPrincipleTag] = useState<string>("all");
  const [roleAffected, setRoleAffected] = useState("");
  const [assignee, setAssignee] = useState<string>(initialAssignee);
  const [archived, setArchived] = useState<ArchivedFilter>("active");
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Re-sync if URL ?assignee changes (e.g. via dashboard link).
  useEffect(() => {
    setAssignee(searchParamsObj.get("assignee") ?? "all");
  }, [searchParamsObj]);

  const { roles, user } = useAuth();
  const canIngest = hasAnyRole(roles, ["admin", "hr"]);
  const canBulk = canIngest;
  const canAssignSelf = hasAnyRole(roles, ["admin", "hr", "exec"]);
  const myQueueActive = !!user && assignee === user.id;

  const { data, isLoading, error } = useSubmissions({
    search,
    status,
    source,
    division,
    feedbackType,
    principleTag,
    roleAffected,
    assignee,
    archived,
  });

  const { data: staff = [] } = useStaffMembers();
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  const { data: redactions } = useExecRedactions();
  const redactionKeywords = useMemo(
    () => (redactions ?? []).map((r) => r.redacted_keyword),
    [redactions],
  );

  const bulkAssign = useBulkAssign();
  const bulkArchive = useBulkArchive();
  const bulkClassify = useBulkClassify();

  const rows = data ?? [];
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const clearSelection = () => setSelected(new Set());
  const ids = Array.from(selected);

  const handleAssign = (assigneeId: string | null) => {
    bulkAssign.mutate(
      { ids, assigneeId },
      {
        onSuccess: () => {
          toast.success(
            assigneeId
              ? `Assigned ${ids.length} submission${ids.length > 1 ? "s" : ""}`
              : `Unassigned ${ids.length} submission${ids.length > 1 ? "s" : ""}`,
          );
          clearSelection();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Assign failed"),
      },
    );
  };

  const handleArchive = (archivedNext: boolean) => {
    bulkArchive.mutate(
      { ids, archived: archivedNext },
      {
        onSuccess: () => {
          toast.success(
            `${archivedNext ? "Archived" : "Restored"} ${ids.length} submission${ids.length > 1 ? "s" : ""}`,
          );
          clearSelection();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Archive failed"),
      },
    );
  };

  const handleClassify = () => {
    const t = toast.loading(
      `Classifying ${ids.length} submission${ids.length > 1 ? "s" : ""}…`,
    );
    bulkClassify.mutate(ids, {
      onSuccess: (results) => {
        const failed = results.filter((r) => !r.ok).length;
        toast.dismiss(t);
        if (failed === 0) toast.success(`Classified ${results.length} submissions`);
        else
          toast.warning(
            `Classified ${results.length - failed} of ${results.length} (${failed} failed)`,
          );
        clearSelection();
      },
      onError: (e) => {
        toast.dismiss(t);
        toast.error(e instanceof Error ? e.message : "Classify failed");
      },
    });
  };

  const busy = bulkAssign.isPending || bulkArchive.isPending || bulkClassify.isPending;

  const exportColumns: ExportColumn<Submission>[] = [
    {
      header: "Received",
      accessor: (s) => fmt(new Date(s.submitted_at), "yyyy-MM-dd HH:mm"),
      width: 28,
    },
    { header: "Source", accessor: (s) => SOURCE_LABELS[s.source] },
    { header: "Status", accessor: (s) => STATUS_LABELS[s.status] },
    { header: "Submitter", accessor: (s) => s.submitter_name ?? "" },
    { header: "Email", accessor: (s) => s.submitter_email ?? "" },
    { header: "Role", accessor: (s) => s.submitter_role ?? "" },
    {
      header: "Assignee",
      accessor: (s) => {
        if (!s.assigned_to) return "";
        const a = staffById.get(s.assigned_to);
        return a?.display_name || a?.email || s.assigned_to;
      },
    },
    { header: "Archived", accessor: (s) => (s.archived_at ? "yes" : "") },
    { header: "Content", accessor: (s) => s.content, width: 110 },
  ];

  const filterSummary = [
    { label: "Search", value: search },
    { label: "Status", value: status === "all" ? "" : STATUS_LABELS[status] },
    { label: "Source", value: source === "all" ? "" : SOURCE_LABELS[source] },
    { label: "Division", value: division === "all" ? "" : division },
    { label: "Feedback type", value: feedbackType === "all" ? "" : feedbackType },
    { label: "Principle", value: principleTag === "all" ? "" : principleTag },
    { label: "Role affected", value: roleAffected },
    {
      label: "Assignee",
      value:
        assignee === "all"
          ? ""
          : assignee === "unassigned"
            ? "Unassigned"
            : staffById.get(assignee)?.display_name ||
              staffById.get(assignee)?.email ||
              assignee,
    },
    { label: "Archived", value: archived === "active" ? "" : archived },
  ];

  const handleExportCSV = () => {
    exportCSV(rows, exportColumns, "submissions");
    toast.success(`Exported ${rows.length} submissions to CSV`);
  };
  const handleExportPDF = () => {
    exportPDF(rows, exportColumns, "submissions", {
      title: "Submissions",
      filters: filterSummary,
    });
    toast.success(`Exported ${rows.length} submissions to PDF`);
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-4 md:space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            All consultation submissions across channels. Newest first.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canAssignSelf && user && (
            <Button
              variant={myQueueActive ? "default" : "outline"}
              size="sm"
              onClick={() => setAssignee(myQueueActive ? "all" : user.id)}
            >
              <UserPlus className="mr-2 h-4 w-4" />
              My queue
            </Button>
          )}
          <ExportMenu
            onExportCSV={handleExportCSV}
            onExportPDF={handleExportPDF}
            disabled={rows.length === 0}
            count={rows.length}
          />
          {canIngest && <NewSubmissionDialog />}
        </div>
      </div>

      <div className="md:hidden flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search submissions…"
            className="pl-9 h-11"
          />
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="h-11 w-11 shrink-0">
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <FilterControls
              status={status}
              setStatus={setStatus}
              source={source}
              setSource={setSource}
              assignee={assignee}
              setAssignee={setAssignee}
              archived={archived}
              setArchived={setArchived}
              division={division}
              setDivision={setDivision}
              feedbackType={feedbackType}
              setFeedbackType={setFeedbackType}
              principleTag={principleTag}
              setPrincipleTag={setPrincipleTag}
              roleAffected={roleAffected}
              setRoleAffected={setRoleAffected}
              staff={staff}
              stacked
            />
          </SheetContent>
        </Sheet>
      </div>

      <div className="hidden md:flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search content, name or email…"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {Object.entries(SOURCE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Assignee" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Anyone</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {user && <SelectItem value={user.id}>Me</SelectItem>}
            {staff.filter((s) => s.id !== user?.id).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.display_name || s.email || s.id.slice(0, 8)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={archived} onValueChange={(v) => setArchived(v as ArchivedFilter)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Archived" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active only</SelectItem>
            <SelectItem value="archived">Archived only</SelectItem>
            <SelectItem value="all">Active + archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={division} onValueChange={setDivision}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Division" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All divisions</SelectItem>
            {DIVISION_OPTIONS.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={feedbackType} onValueChange={setFeedbackType}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Feedback type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All feedback types</SelectItem>
            {FEEDBACK_TYPE_OPTIONS.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={principleTag} onValueChange={setPrincipleTag}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Principle" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All principles</SelectItem>
            {PRINCIPLE_TAG_OPTIONS.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
          </SelectContent>
        </Select>
        <Input
          value={roleAffected}
          onChange={(e) => setRoleAffected(e.target.value)}
          placeholder="Role affected"
          className="w-48"
        />
      </div>

      {canBulk && selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-primary/5 px-4 py-3 shadow-sm">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleClassify} disabled={busy}>
              <Sparkles className="mr-2 h-4 w-4" />
              Classify with AI
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={busy}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Assign
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                <DropdownMenuLabel>Assign to</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => handleAssign(null)}>
                  Unassigned
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {staff.length === 0 && (
                  <DropdownMenuItem disabled>No staff available</DropdownMenuItem>
                )}
                {staff.map((s) => (
                  <DropdownMenuItem key={s.id} onSelect={() => handleAssign(s.id)}>
                    {s.display_name || s.email || s.id.slice(0, 8)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {archived === "archived" ? (
              <Button size="sm" variant="outline" onClick={() => handleArchive(false)} disabled={busy}>
                <ArchiveRestore className="mr-2 h-4 w-4" />
                Restore
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => handleArchive(true)} disabled={busy}>
                <Archive className="mr-2 h-4 w-4" />
                Archive
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={clearSelection} disabled={busy}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="hidden md:block rounded-lg border bg-card">
        {error ? (
          <div className="p-8 text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load submissions"}
          </div>
        ) : isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading submissions…</div>
        ) : rows.length === 0 ? (
          <EmptyState canIngest={canIngest} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {canBulk && (
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                )}
                <TableHead className="w-[40px] text-slate-50">Received</TableHead>
                <TableHead className="w-[110px] text-slate-50">Source</TableHead>
                <TableHead className="w-[200px] text-slate-50">Submitter</TableHead>
                <TableHead>Content</TableHead>
                <TableHead className="w-[140px] text-slate-50">Assignee</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const isSelected = selected.has(s.id);
                const assignedTo = s.assigned_to ? staffById.get(s.assigned_to) : null;
                return (
                  <TableRow
                    key={s.id}
                    data-state={isSelected ? "selected" : undefined}
                    className={`cursor-pointer ${s.archived_at ? "opacity-60" : ""}`}
                    onClick={() => setOpenId(s.id)}
                  >
                    {canBulk && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleOne(s.id)}
                          aria-label="Select row"
                        />
                      </TableCell>
                    )}
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(s.submitted_at), "d MMM, h:mm a")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{SOURCE_LABELS[s.source]}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium text-foreground">
                        {s.submitter_name
                          ? applyRedactions(s.submitter_name, redactionKeywords)
                          : "Anonymous"}
                      </div>
                      {s.submitter_email && (
                        <div className="text-xs text-muted-foreground">
                          {applyRedactions(s.submitter_email, redactionKeywords)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {applyRedactions(s.content, redactionKeywords)}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {assignedTo
                        ? assignedTo.display_name || assignedTo.email || "—"
                        : <span className="italic">Unassigned</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge>{STATUS_LABELS[s.status]}</Badge>
                        {s.archived_at && (
                          <Badge variant="outline" className="text-xs">Archived</Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="md:hidden">
        {error ? (
          <div className="rounded-lg border bg-card p-6 text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load submissions"}
          </div>
        ) : isLoading ? (
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            Loading submissions…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border bg-card">
            <EmptyState canIngest={canIngest} />
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((s) => (
              <li key={s.id}>
                <MobileSubmissionCard
                  submission={s}
                  redactionKeywords={redactionKeywords}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <SubmissionDetailSheet submissionId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function EmptyState({ canIngest }: { canIngest: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="rounded-full bg-muted p-3">
        <Inbox className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-base font-semibold">No submissions yet</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {canIngest
          ? "Use 'New submission' to log feedback received via email, CC, or in-person conversations."
          : "Submissions will appear here as the consultation progresses."}
      </p>
    </div>
  );
}

function MobileSubmissionCard({
  submission: s,
  redactionKeywords,
}: {
  submission: Submission;
  redactionKeywords: string[];
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(`/app/submissions/${s.id}`)}
      className={`w-full text-left rounded-lg border bg-card p-4 active:bg-muted/40 ${s.archived_at ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm text-foreground truncate">
            {s.submitter_name
              ? applyRedactions(s.submitter_name, redactionKeywords)
              : "Anonymous"}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {format(new Date(s.submitted_at), "d MMM, h:mm a")}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant="secondary" className="text-[10px]">
            {SOURCE_LABELS[s.source]}
          </Badge>
          <Badge className="text-[10px]">{STATUS_LABELS[s.status]}</Badge>
        </div>
      </div>
      <p className="line-clamp-1 text-sm text-muted-foreground mt-2">
        {applyRedactions(s.content, redactionKeywords)}
      </p>
    </button>
  );
}

type StaffMember = { id: string; display_name: string | null; email: string | null };

function FilterControls(props: {
  status: SubmissionStatus | "all";
  setStatus: (v: SubmissionStatus | "all") => void;
  source: SubmissionSource | "all";
  setSource: (v: SubmissionSource | "all") => void;
  assignee: string;
  setAssignee: (v: string) => void;
  archived: ArchivedFilter;
  setArchived: (v: ArchivedFilter) => void;
  division: string;
  setDivision: (v: string) => void;
  feedbackType: string;
  setFeedbackType: (v: string) => void;
  principleTag: string;
  setPrincipleTag: (v: string) => void;
  roleAffected: string;
  setRoleAffected: (v: string) => void;
  staff: StaffMember[];
  stacked?: boolean;
}) {
  const wrap = props.stacked ? "grid grid-cols-1 gap-3 mt-2" : "flex flex-wrap gap-3";
  const trig = "h-11 w-full";
  return (
    <div className={wrap}>
      <Select value={props.status} onValueChange={(v) => props.setStatus(v as typeof props.status)}>
        <SelectTrigger className={trig}><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <SelectItem key={k} value={k}>{v}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={props.source} onValueChange={(v) => props.setSource(v as typeof props.source)}>
        <SelectTrigger className={trig}><SelectValue placeholder="Source" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All sources</SelectItem>
          {Object.entries(SOURCE_LABELS).map(([k, v]) => (
            <SelectItem key={k} value={k}>{v}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={props.assignee} onValueChange={props.setAssignee}>
        <SelectTrigger className={trig}><SelectValue placeholder="Assignee" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All assignees</SelectItem>
          <SelectItem value="unassigned">Unassigned</SelectItem>
          {props.staff.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.display_name || s.email || s.id.slice(0, 8)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={props.archived} onValueChange={(v) => props.setArchived(v as ArchivedFilter)}>
        <SelectTrigger className={trig}><SelectValue placeholder="Archived" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Active only</SelectItem>
          <SelectItem value="archived">Archived only</SelectItem>
          <SelectItem value="all">Active + archived</SelectItem>
        </SelectContent>
      </Select>
      <Select value={props.division} onValueChange={props.setDivision}>
        <SelectTrigger className={trig}><SelectValue placeholder="Division" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All divisions</SelectItem>
          {DIVISION_OPTIONS.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
        </SelectContent>
      </Select>
      <Select value={props.feedbackType} onValueChange={props.setFeedbackType}>
        <SelectTrigger className={trig}><SelectValue placeholder="Feedback type" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All feedback types</SelectItem>
          {FEEDBACK_TYPE_OPTIONS.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
        </SelectContent>
      </Select>
      <Select value={props.principleTag} onValueChange={props.setPrincipleTag}>
        <SelectTrigger className={trig}><SelectValue placeholder="Principle" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All principles</SelectItem>
          {PRINCIPLE_TAG_OPTIONS.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
        </SelectContent>
      </Select>
      <Input
        value={props.roleAffected}
        onChange={(e) => props.setRoleAffected(e.target.value)}
        placeholder="Role affected"
        className="h-11"
      />
    </div>
  );
}
