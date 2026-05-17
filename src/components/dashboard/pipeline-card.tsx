"use client";

import Link from "next/link";
import { AlertCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import {
  RESPONSE_STATUS_LABELS,
  usePipelineCounts,
  useStuckResponses,
  type ResponseStatus,
} from "@/lib/responses";
import type { FlowStep } from "@/components/submissions/submission-flow";
import { cn } from "@/lib/utils";

const STEP_LABELS: Record<FlowStep, string> = {
  new: "Logged",
  classified: "Classified",
  draft: "Drafted",
  hr_reviewed: "HR reviewed",
  exec_approved: "Exec approved",
  sent: "Sent",
};

const STEP_HREF: Record<FlowStep, string> = {
  new: "/app/inbox?status=new",
  classified: "/app/inbox?status=classified",
  draft: "/app/responses?status=draft",
  hr_reviewed: "/app/responses?status=hr_reviewed",
  exec_approved: "/app/responses?status=exec_approved",
  sent: "/app/responses?status=sent",
};

const ORDER: FlowStep[] = [
  "new",
  "classified",
  "draft",
  "hr_reviewed",
  "exec_approved",
  "sent",
];

export function PipelineCard() {
  const { data: counts, isLoading } = usePipelineCounts();
  const { data: stuck = [], isLoading: stuckLoading } = useStuckResponses(5);

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Pipeline
        </h2>
        <span className="text-xs text-muted-foreground">
          Where every active item sits today
        </span>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {ORDER.map((step) => {
            const count = counts?.[step] ?? 0;
            return (
              <Link
                key={step}
                href={STEP_HREF[step]}
                className={cn(
                  "rounded-md border bg-background p-3 transition hover:border-primary/40 hover:bg-muted/40",
                )}
              >
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
                  {STEP_LABELS[step]}
                </div>
                <div className="text-xl font-semibold tabular-nums mt-1">
                  {isLoading ? "—" : count.toLocaleString()}
                </div>
              </Link>
            );
          })}
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Stuck more than 5 days
            </h3>
            {!stuckLoading && stuck.length > 0 && (
              <span className="text-xs text-muted-foreground">· {stuck.length}</span>
            )}
          </div>
          {stuckLoading ? (
            <p className="text-sm text-muted-foreground">Checking…</p>
          ) : stuck.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing has been idle for more than 5 days. Nice.
            </p>
          ) : (
            <ul className="space-y-1">
              {stuck.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/app/responses?status=${r.status}`}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 transition"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">
                        {r.submitter_name ?? "Anonymous submitter"}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        · {RESPONSE_STATUS_LABELS[r.status as ResponseStatus]}
                      </span>
                    </span>
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-400 tabular-nums shrink-0">
                      {r.days_stuck}d
                      <span className="ml-2 text-muted-foreground font-normal">
                        since {format(new Date(r.last_transition_at), "d MMM")}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
