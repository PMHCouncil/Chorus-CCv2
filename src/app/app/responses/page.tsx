"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import {
  RESPONSE_STATUS_LABELS,
  useResponses,
  type ResponseStatus,
} from "@/lib/responses";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Inbox as InboxIcon, MailCheck, Search } from "lucide-react";
import { SubmissionDetailSheet } from "@/components/submissions/submission-detail-sheet";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<ResponseStatus, string> = {
  draft: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
  hr_reviewed: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
  exec_approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  sent: "bg-primary/15 text-primary border-primary/30",
};

const VALID_STATUSES: Array<ResponseStatus | "all"> = [
  "all",
  "draft",
  "hr_reviewed",
  "exec_approved",
  "sent",
];

function isValidStatus(v: string | null): v is ResponseStatus | "all" {
  return !!v && (VALID_STATUSES as string[]).includes(v);
}

export default function ResponsesPage() {
  const searchParams = useSearchParams();
  const initialStatus = (() => {
    const v = searchParams.get("status");
    return isValidStatus(v) ? v : "all";
  })();

  const [status, setStatus] = useState<ResponseStatus | "all">(initialStatus);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  // Re-sync when an external link changes ?status (e.g. dashboard card).
  useEffect(() => {
    const v = searchParams.get("status");
    if (isValidStatus(v)) setStatus(v);
  }, [searchParams]);

  const { data, isLoading } = useResponses({ status, search });

  const counts = (data ?? []).reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<ResponseStatus, number>,
  );

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-4 md:space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-muted p-2">
          <MailCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">Responses</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Draft, review and approve replies to staff feedback. Open a response to edit
            and progress it through the workflow.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(Object.keys(RESPONSE_STATUS_LABELS) as ResponseStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatus((cur) => (cur === s ? "all" : s))}
            className={cn(
              "rounded-lg border bg-card p-4 text-left transition hover:border-primary/40",
              status === s && "border-primary ring-1 ring-primary/30",
            )}
          >
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {RESPONSE_STATUS_LABELS[s]}
            </div>
            <div className="mt-1 text-2xl font-semibold">{counts[s] ?? 0}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search drafts, names, content…"
            className="pl-8 h-11 md:h-10"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as ResponseStatus | "all")}>
          <SelectTrigger className="w-44 h-11 md:h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(RESPONSE_STATUS_LABELS) as ResponseStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {RESPONSE_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card divide-y">
        {isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading responses…</div>
        ) : !data || data.length === 0 ? (
          <div className="p-10 text-center">
            <InboxIcon className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              No responses match these filters yet.
            </p>
          </div>
        ) : (
          data.map((r) => (
            <button
              key={r.id}
              onClick={() => r.submissions && setOpenId(r.submissions.id)}
              className="w-full text-left p-4 hover:bg-muted/40 transition flex flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className={cn("border", STATUS_TONE[r.status])}>
                    {RESPONSE_STATUS_LABELS[r.status]}
                  </Badge>
                  <span className="font-medium truncate">
                    {r.submissions?.submitter_name ?? "Anonymous submitter"}
                  </span>
                  {r.submissions?.submitter_role && (
                    <span className="text-xs text-muted-foreground truncate">
                      · {r.submissions.submitter_role}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {format(new Date(r.created_at), "d MMM, h:mma")}
                </span>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">{r.draft_text}</p>
              {r.change_made && (
                <span className="text-[11px] text-muted-foreground">Edited from AI draft</span>
              )}
            </button>
          ))
        )}
      </div>

      <SubmissionDetailSheet submissionId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
