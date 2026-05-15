"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, subDays, startOfDay } from "date-fns";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useStaffMembers, STATUS_LABELS, type SubmissionStatus } from "@/lib/submissions";

function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [subs, themes, pending] = await Promise.all([
        supabase
          .from("submissions")
          .select("id", { count: "exact", head: true })
          .is("archived_at", null),
        supabase
          .from("themes")
          .select("id", { count: "exact", head: true })
          .gt("submission_count", 0),
        supabase
          .from("responses")
          .select("id", { count: "exact", head: true })
          .neq("status", "sent"),
      ]);
      if (subs.error) throw subs.error;
      if (themes.error) throw themes.error;
      if (pending.error) throw pending.error;
      return {
        submissions: subs.count ?? 0,
        themes: themes.count ?? 0,
        pending: pending.count ?? 0,
      };
    },
  });
}

function useAssignmentStats() {
  return useQuery({
    queryKey: ["assignment-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("submissions")
        .select("assigned_to")
        .is("archived_at", null)
        .limit(2000);
      if (error) throw error;
      const counts = new Map<string, number>();
      let unassigned = 0;
      for (const row of data ?? []) {
        if (!row.assigned_to) unassigned++;
        else counts.set(row.assigned_to, (counts.get(row.assigned_to) ?? 0) + 1);
      }
      return { counts, unassigned };
    },
  });
}

const STATUS_COLORS: Record<SubmissionStatus, string> = {
  new: "hsl(217 91% 60%)",
  classified: "hsl(262 83% 58%)",
  themed: "hsl(280 65% 60%)",
  responded: "hsl(38 92% 50%)",
  sent: "hsl(142 71% 45%)",
};

function useSubmissionTrend() {
  return useQuery({
    queryKey: ["dashboard-trend"],
    queryFn: async () => {
      const since = subDays(startOfDay(new Date()), 29).toISOString();
      const { data, error } = await supabase
        .from("submissions")
        .select("submitted_at, status")
        .gte("submitted_at", since)
        .is("archived_at", null)
        .limit(2000);
      if (error) throw error;

      const byDay = new Map<string, number>();
      const statusCounts = new Map<SubmissionStatus, number>();
      for (let i = 29; i >= 0; i--) {
        byDay.set(format(subDays(new Date(), i), "yyyy-MM-dd"), 0);
      }
      for (const row of data ?? []) {
        const key = format(new Date(row.submitted_at as string), "yyyy-MM-dd");
        if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1);
        const s = row.status as SubmissionStatus;
        statusCounts.set(s, (statusCounts.get(s) ?? 0) + 1);
      }
      const trend = Array.from(byDay.entries()).map(([d, count]) => ({
        date: d,
        label: format(new Date(d), "d MMM"),
        count,
      }));
      const status = (Object.keys(STATUS_LABELS) as SubmissionStatus[])
        .map((k) => ({
          key: k,
          label: STATUS_LABELS[k],
          value: statusCounts.get(k) ?? 0,
          color: STATUS_COLORS[k],
        }))
        .filter((s) => s.value > 0);
      return { trend, status };
    },
  });
}

export default function Dashboard() {
  const { user, roles } = useAuth();
  const { data, isLoading } = useDashboardStats();
  const { data: assignStats } = useAssignmentStats();
  const { data: staff = [] } = useStaffMembers();
  const { data: trendData, isLoading: trendLoading } = useSubmissionTrend();

  const totalLast30 = useMemo(
    () => (trendData?.trend ?? []).reduce((acc, d) => acc + d.count, 0),
    [trendData],
  );

  const stats = [
    { label: "Submissions", value: data?.submissions ?? 0 },
    { label: "Open themes", value: data?.themes ?? 0 },
    { label: "Pending approvals", value: data?.pending ?? 0 },
  ];

  const assignedRows = staff
    .map((s) => ({
      ...s,
      count: assignStats?.counts.get(s.id) ?? 0,
    }))
    .sort((a, b) => b.count - a.count);

  const initials = (s: { display_name: string | null; email: string | null }) => {
    const src = (s.display_name || s.email || "?").trim();
    return (
      src
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? "")
        .join("") || "?"
    );
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Signed in as <span className="font-medium text-foreground">{user?.email}</span>
          {roles.length > 0 && <> · roles: {roles.join(", ")}</>}
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {s.label}
            </div>
            <div className="text-2xl font-semibold mt-1">
              {isLoading ? "—" : s.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2 rounded-lg border bg-card p-4">
          <div className="flex items-baseline justify-between">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Submissions · last 30 days
            </div>
            <div className="text-xs text-muted-foreground">
              {trendLoading ? "—" : `${totalLast30} total`}
            </div>
          </div>
          <div className="h-56 mt-3">
            {trendLoading ? (
              <div className="h-full grid place-content-center text-xs text-muted-foreground">
                Loading…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={trendData?.trend ?? []}
                  margin={{ left: -20, right: 8, top: 8, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(217 91% 60%)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={32}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(217 91% 60%)"
                    strokeWidth={2}
                    fill="url(#trendFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Status mix
          </div>
          <div className="h-56 mt-3 relative">
            {trendLoading ? (
              <div className="h-full grid place-content-center text-xs text-muted-foreground">
                Loading…
              </div>
            ) : (trendData?.status ?? []).length === 0 ? (
              <div className="h-full grid place-content-center text-xs text-muted-foreground">
                No data
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={trendData?.status ?? []}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={2}
                      stroke="hsl(var(--card))"
                      strokeWidth={2}
                    >
                      {(trendData?.status ?? []).map((s) => (
                        <Cell key={s.key} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 grid place-content-center pointer-events-none">
                  <div className="text-center">
                    <div className="text-xl font-semibold">
                      {(trendData?.status ?? []).reduce((a, s) => a + s.value, 0)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Active
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            {(trendData?.status ?? []).map((s) => (
              <li key={s.key} className="flex items-center gap-1.5 truncate">
                <span
                  className="h-2 w-2 rounded-sm shrink-0"
                  style={{ background: s.color }}
                />
                <span className="truncate">{s.label}</span>
                <span className="ml-auto tabular-nums text-muted-foreground">
                  {s.value}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link
          href="/app/inbox?assignee=unassigned"
          className="rounded-lg border bg-card p-4 hover:bg-muted/30 transition"
        >
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Unassigned
          </div>
          <div className="text-2xl font-semibold mt-1">
            {assignStats?.unassigned ?? "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Submissions waiting for an owner
          </div>
        </Link>

        <div className="md:col-span-2 rounded-lg border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
            Workload by assignee
          </div>
          {assignedRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No staff yet.</p>
          ) : (
            <ul className="space-y-2">
              {assignedRows.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="grid h-6 w-6 place-content-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary shrink-0">
                      {initials(s)}
                    </span>
                    <span className="truncate">
                      {s.display_name || s.email || s.id.slice(0, 8)}
                    </span>
                    {s.roles?.[0] && (
                      <span className="text-[10px] uppercase text-muted-foreground">
                        {s.roles[0]}
                      </span>
                    )}
                  </span>
                  <span className="font-semibold tabular-nums">{s.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
