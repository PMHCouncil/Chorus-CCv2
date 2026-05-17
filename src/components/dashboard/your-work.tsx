"use client";

import Link from "next/link";
import { ArrowRight, ClipboardList, FilePen, ShieldCheck, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { hasAnyRole, type AppRole } from "@/lib/auth";
import { useMyWorkStats } from "@/lib/responses";

const EDITOR_ROLES: AppRole[] = ["hr", "gm", "gm_ea", "director"];
const APPROVER_ROLES: AppRole[] = ["gm", "director", "exec"];
const SENDER_ROLES: AppRole[] = ["hr"];

type Card = {
  key: string;
  label: string;
  hint: string;
  icon: typeof ClipboardList;
  count: number | undefined;
  href: string;
  tone: string;
};

export function YourWork({
  userId,
  roles,
}: {
  userId: string;
  roles: AppRole[];
}) {
  const { data, isLoading } = useMyWorkStats(userId);

  const cards: Card[] = [
    {
      key: "assigned",
      label: "Assigned to you",
      hint: "Submissions on your plate",
      icon: ClipboardList,
      count: data?.assigned,
      href: `/app/inbox?assignee=${userId}`,
      tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
    },
  ];

  if (hasAnyRole(roles, EDITOR_ROLES)) {
    cards.push({
      key: "drafts",
      label: "Your drafts",
      hint: "Replies you started, not yet handed off",
      icon: FilePen,
      count: data?.myDrafts,
      href: "/app/responses?status=draft",
      tone: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30",
    });
  }

  if (hasAnyRole(roles, APPROVER_ROLES)) {
    cards.push({
      key: "approve",
      label: "Awaiting your approval",
      hint: "Drafts HR has reviewed",
      icon: ShieldCheck,
      count: data?.awaitingApproval,
      href: "/app/responses?status=hr_reviewed",
      tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    });
  }

  if (hasAnyRole(roles, SENDER_ROLES)) {
    cards.push({
      key: "send",
      label: "Ready to send",
      hint: "Approved replies waiting to go out",
      icon: Send,
      count: data?.readyToSend,
      href: "/app/responses?status=exec_approved",
      tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    });
  }

  if (cards.length === 0) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Your work
        </h2>
      </div>
      <div
        className={cn(
          "grid gap-3",
          cards.length === 1 && "sm:grid-cols-1",
          cards.length === 2 && "sm:grid-cols-2",
          cards.length === 3 && "sm:grid-cols-3",
          cards.length >= 4 && "sm:grid-cols-2 lg:grid-cols-4",
        )}
      >
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.key}
              href={c.href}
              className={cn(
                "group rounded-lg border bg-card p-4 transition hover:border-primary/40 hover:bg-muted/20",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-md border",
                    c.tone,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
              </div>
              <div className="mt-3 text-2xl font-semibold tabular-nums">
                {isLoading ? "—" : (c.count ?? 0).toLocaleString()}
              </div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mt-0.5">
                {c.label}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">{c.hint}</div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
