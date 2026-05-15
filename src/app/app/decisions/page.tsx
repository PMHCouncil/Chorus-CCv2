"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Gavel, Search, ShieldAlert, History, Plus, X, EyeOff } from "lucide-react";
import { hasAnyRole, useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  useThemesWithBreakdown,
  useThemeMembers,
  type ThemeWithSentiment,
} from "@/lib/themes";
import { SENTIMENT_TONE, type Sentiment } from "@/lib/classify";
import {
  DECISION_STATUS_OPTIONS,
  DECISION_TONE,
  applyRedactions,
  useAddRedaction,
  useDecisionHistory,
  useExecRedactions,
  useLatestDecisionsByTheme,
  useRecordDecision,
  useRemoveRedaction,
  type DecisionStatus,
} from "@/lib/decisions";
import { ExportMenu } from "@/components/export-menu";
import { exportCSV, exportPDF, type ExportColumn } from "@/lib/export";
import { format as fmt } from "date-fns";

export default function DecisionsPage() {
  const { roles } = useAuth();
  const canDecide = hasAnyRole(roles, ["admin", "exec"]);
  const canManageRedactions = hasAnyRole(roles, ["admin"]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<DecisionStatus | "all" | "undecided">("all");
  const [openThemeId, setOpenThemeId] = useState<string | null>(null);

  const { data: themes, isLoading } = useThemesWithBreakdown();
  const { data: latestDecisions } = useLatestDecisionsByTheme();
  const { data: redactions } = useExecRedactions();
  const redactionKeywords = useMemo(
    () => (redactions ?? []).map((r) => r.redacted_keyword),
    [redactions],
  );

  const filtered = useMemo(() => {
    let rows = themes ?? [];
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      rows = rows.filter(
        (t) => t.name.toLowerCase().includes(s) || (t.summary ?? "").toLowerCase().includes(s),
      );
    }
    if (statusFilter !== "all") {
      rows = rows.filter((t) => {
        const d = latestDecisions?.get(t.id);
        if (statusFilter === "undecided") return !d;
        return d?.status === statusFilter;
      });
    }
    return rows;
  }, [themes, search, statusFilter, latestDecisions]);

  const counts = useMemo(() => {
    const c: Record<DecisionStatus | "undecided", number> = {
      Acknowledged: 0,
      "Under consideration": 0,
      "Change agreed": 0,
      "No change": 0,
      undecided: 0,
    };
    for (const t of themes ?? []) {
      const d = latestDecisions?.get(t.id);
      if (!d) c.undecided += 1;
      else c[d.status] += 1;
    }
    return c;
  }, [themes, latestDecisions]);

  const exportColumns: ExportColumn<ThemeWithSentiment>[] = [
    { header: "Theme", accessor: (t) => t.name, width: 50 },
    { header: "Submissions", accessor: (t) => t.submission_count },
    {
      header: "Decision",
      accessor: (t) => latestDecisions?.get(t.id)?.status ?? "Undecided",
    },
    {
      header: "Decided at",
      accessor: (t) => {
        const d = latestDecisions?.get(t.id);
        return d ? fmt(new Date(d.decided_at), "yyyy-MM-dd HH:mm") : "";
      },
    },
    {
      header: "Notes",
      accessor: (t) =>
        applyRedactions(latestDecisions?.get(t.id)?.notes ?? "", redactionKeywords),
      width: 90,
    },
    { header: "Summary", accessor: (t) => t.summary ?? "", width: 90 },
  ];

  const filterSummary = [
    { label: "Search", value: search },
    { label: "Status", value: statusFilter === "all" ? "" : statusFilter },
  ];

  const handleExportCSV = () => {
    exportCSV(filtered, exportColumns, "decisions");
    toast.success(`Exported ${filtered.length} themes to CSV`);
  };
  const handleExportPDF = () => {
    exportPDF(filtered, exportColumns, "decisions", {
      title: "Decisions",
      filters: filterSummary,
    });
    toast.success(`Exported ${filtered.length} themes to PDF`);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-muted p-2">
            <Gavel className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Decisions</h1>
            <p className="text-sm text-muted-foreground">
              Executive view of every theme. Record decisions and rationale; previous
              decisions are kept for the audit trail.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            onExportCSV={handleExportCSV}
            onExportPDF={handleExportPDF}
            disabled={filtered.length === 0}
            count={filtered.length}
          />
          {canManageRedactions && <RedactionsManager keywords={redactions ?? []} />}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label="Undecided"
          value={counts.undecided}
          active={statusFilter === "undecided"}
          onClick={() =>
            setStatusFilter((s) => (s === "undecided" ? "all" : "undecided"))
          }
        />
        {DECISION_STATUS_OPTIONS.map((s) => (
          <StatCard
            key={s}
            label={s}
            value={counts[s]}
            active={statusFilter === s}
            onClick={() => setStatusFilter((cur) => (cur === s ? "all" : s))}
            tone={DECISION_TONE[s]}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search themes…"
            className="pl-8"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
        >
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All themes</SelectItem>
            <SelectItem value="undecided">Undecided</SelectItem>
            {DECISION_STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card divide-y">
        {isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading themes…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No themes match these filters.
          </div>
        ) : (
          filtered.map((t) => (
            <ThemeRowItem
              key={t.id}
              theme={t}
              decisionStatus={latestDecisions?.get(t.id)?.status}
              onOpen={() => setOpenThemeId(t.id)}
            />
          ))
        )}
      </div>

      <DecisionSheet
        themeId={openThemeId}
        onClose={() => setOpenThemeId(null)}
        canDecide={canDecide}
        redactionKeywords={redactionKeywords}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  active,
  onClick,
  tone,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
  tone?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border bg-card p-4 text-left transition hover:border-primary/40",
        active && "border-primary ring-1 ring-primary/30",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        {tone && <span className={cn("h-2 w-2 rounded-full border", tone)} />}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </button>
  );
}

function ThemeRowItem({
  theme,
  decisionStatus,
  onOpen,
}: {
  theme: ThemeWithSentiment;
  decisionStatus: DecisionStatus | undefined;
  onOpen: () => void;
}) {
  const total = Object.values(theme.sentiment_breakdown).reduce((a, b) => a + b, 0) || 1;
  return (
    <button
      onClick={onOpen}
      className="w-full text-left p-4 hover:bg-muted/40 transition flex flex-col gap-2"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-medium truncate">{theme.name}</div>
          {theme.summary && (
            <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
              {theme.summary}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary">{theme.submission_count} submissions</Badge>
          {decisionStatus ? (
            <Badge variant="outline" className={cn("border", DECISION_TONE[decisionStatus])}>
              {decisionStatus}
            </Badge>
          ) : (
            <Badge variant="outline">Undecided</Badge>
          )}
        </div>
      </div>
      <SentimentBar breakdown={theme.sentiment_breakdown} total={total} />
    </button>
  );
}

function SentimentBar({
  breakdown,
  total,
}: {
  breakdown: Record<Sentiment | "Unclassified", number>;
  total: number;
}) {
  const order: Array<Sentiment | "Unclassified"> = [
    "Supportive",
    "Neutral",
    "Concerned",
    "Opposing",
    "Unclassified",
  ];
  const colors: Record<Sentiment | "Unclassified", string> = {
    Supportive: "bg-emerald-500",
    Neutral: "bg-slate-400",
    Concerned: "bg-amber-500",
    Opposing: "bg-rose-500",
    Unclassified: "bg-muted",
  };
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
      {order.map((k) => {
        const v = breakdown[k];
        if (!v) return null;
        return (
          <div
            key={k}
            className={colors[k]}
            style={{ width: `${(v / total) * 100}%` }}
            title={`${k}: ${v}`}
          />
        );
      })}
    </div>
  );
}

function DecisionSheet({
  themeId,
  onClose,
  canDecide,
  redactionKeywords,
}: {
  themeId: string | null;
  onClose: () => void;
  canDecide: boolean;
  redactionKeywords: string[];
}) {
  const { data: members } = useThemeMembers(themeId);
  const { data: history } = useDecisionHistory(themeId);
  const record = useRecordDecision();

  const [status, setStatus] = useState<DecisionStatus>("Acknowledged");
  const [notes, setNotes] = useState("");

  const latest = history?.[0];

  const handleRecord = async () => {
    if (!themeId) return;
    try {
      await record.mutateAsync({ themeId, status, notes });
      toast.success(`Recorded: ${status}`);
      setNotes("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record decision");
    }
  };

  return (
    <Sheet open={!!themeId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Theme decision</SheetTitle>
          <SheetDescription>
            Submission text below is shown with org-wide redactions applied for the
            executive view.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Current status
            </h4>
            <div className="mt-2">
              {latest ? (
                <div className="space-y-2">
                  <Badge variant="outline" className={cn("border", DECISION_TONE[latest.status])}>
                    {latest.status}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    Recorded {format(new Date(latest.decided_at), "PPP 'at' p")}
                  </p>
                  {latest.notes && (
                    <p className="text-sm whitespace-pre-wrap rounded-md border bg-muted/30 p-3">
                      {latest.notes}
                    </p>
                  )}
                </div>
              ) : (
                <Badge variant="outline">Undecided</Badge>
              )}
            </div>
          </div>

          {canDecide && (
            <div className="space-y-3 rounded-lg border bg-card p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Record a decision
              </h4>
              <div className="grid gap-2">
                <Select value={status} onValueChange={(v) => setStatus(v as DecisionStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DECISION_STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  rows={4}
                  placeholder="Rationale and any commitments (optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <div className="flex justify-end">
                  <Button onClick={handleRecord} disabled={record.isPending}>
                    {record.isPending ? "Saving…" : "Record decision"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {history && history.length > 1 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                <History className="h-3.5 w-3.5" /> Decision history
              </h4>
              <div className="mt-2 space-y-2">
                {history.slice(1).map((h) => (
                  <div key={h.id} className="rounded-md border bg-muted/30 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={cn("border", DECISION_TONE[h.status])}>
                        {h.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(h.decided_at), "d MMM yyyy")}
                      </span>
                    </div>
                    {h.notes && (
                      <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                        {h.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator />

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <EyeOff className="h-3.5 w-3.5" /> Submissions in this theme
              {redactionKeywords.length > 0 && (
                <Badge variant="outline" className="ml-1 text-[10px]">
                  redactions on
                </Badge>
              )}
            </h4>
            <div className="mt-2 space-y-2">
              {!members || members.length === 0 ? (
                <p className="text-sm text-muted-foreground">No submissions linked.</p>
              ) : (
                members.map((m) => (
                  <div key={m.submission_id} className="rounded-md border bg-card p-3">
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">
                        {m.submission.submitter_name ?? "Anonymous"}
                        {m.submission.submitter_role
                          ? ` · ${m.submission.submitter_role}`
                          : ""}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {m.classification?.sentiment && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "border text-[10px]",
                              SENTIMENT_TONE[m.classification.sentiment],
                            )}
                          >
                            {m.classification.sentiment}
                          </Badge>
                        )}
                        <span>{format(new Date(m.submission.submitted_at), "d MMM")}</span>
                      </div>
                    </div>
                    <p className="mt-2 text-sm whitespace-pre-wrap leading-relaxed">
                      {applyRedactions(m.submission.content, redactionKeywords)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RedactionsManager({
  keywords,
}: {
  keywords: { id: string; redacted_keyword: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const add = useAddRedaction();
  const remove = useRemoveRedaction();

  const handleAdd = async () => {
    const k = value.trim();
    if (!k) return;
    try {
      await add.mutateAsync(k);
      setValue("");
      toast.success("Redaction added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ShieldAlert className="mr-2 h-4 w-4" /> Manage redactions
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Executive view redactions</SheetTitle>
            <SheetDescription>
              Keywords listed here are masked in submission text shown on the Decisions
              page. Use to remove identifying terms before exec review.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <div className="flex gap-2">
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="e.g. a name, a role, a project codename"
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
              <Button onClick={handleAdd} disabled={add.isPending}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-1.5">
              {keywords.length === 0 && (
                <p className="text-sm text-muted-foreground">No keywords yet.</p>
              )}
              {keywords.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between rounded-md border bg-card px-3 py-2"
                >
                  <span className="text-sm font-mono">{k.redacted_keyword}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove.mutate(k.id)}
                    disabled={remove.isPending}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
