import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, subDays } from "date-fns";

export type RangeDays = 30 | 90 | 180 | 365;

interface SubmissionRow {
  id: string;
  submitted_at: string;
  status: string;
}
interface ClassificationRow {
  submission_id: string;
  sentiment: string | null;
  divisions: string[] | null;
  principle_tags: string[] | null;
}
interface ResponseRow {
  submission_id: string;
  status: string;
  created_at: string;
  sent_at: string | null;
}

const SENTIMENTS = ["Supportive", "Neutral", "Concerned", "Opposing"] as const;
const RESPONSE_STATUSES = ["draft", "hr_reviewed", "exec_approved", "sent"] as const;

export function useAnalytics(days: RangeDays = 90) {
  return useQuery({
    queryKey: ["analytics", days],
    queryFn: async () => {
      const since = subDays(new Date(), days).toISOString();

      const [subsRes, classRes, respRes] = await Promise.all([
        supabase
          .from("submissions")
          .select("id, submitted_at, status")
          .gte("submitted_at", since)
          .is("archived_at", null)
          .limit(5000),
        supabase
          .from("classifications")
          .select("submission_id, sentiment, divisions, principle_tags")
          .limit(5000),
        supabase
          .from("responses")
          .select("submission_id, status, created_at, sent_at")
          .gte("created_at", since)
          .limit(5000),
      ]);

      if (subsRes.error) throw subsRes.error;
      if (classRes.error) throw classRes.error;
      if (respRes.error) throw respRes.error;

      const subs = (subsRes.data ?? []) as SubmissionRow[];
      const subsById = new Map(subs.map((s) => [s.id, s]));
      const classes = ((classRes.data ?? []) as ClassificationRow[]).filter((c) =>
        subsById.has(c.submission_id),
      );
      const responses = (respRes.data ?? []) as ResponseRow[];

      const divCount = new Map<string, number>();
      for (const c of classes) {
        for (const d of c.divisions ?? []) {
          divCount.set(d, (divCount.get(d) ?? 0) + 1);
        }
      }
      const byDivision = Array.from(divCount.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

      const pCount = new Map<string, number>();
      for (const c of classes) {
        for (const p of c.principle_tags ?? []) {
          pCount.set(p, (pCount.get(p) ?? 0) + 1);
        }
      }
      const byPrinciple = Array.from(pCount.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

      const sentimentByWeek = new Map<string, Record<string, number>>();
      for (const c of classes) {
        if (!c.sentiment) continue;
        const sub = subsById.get(c.submission_id);
        if (!sub) continue;
        const wk = format(
          startOfWeek(new Date(sub.submitted_at), { weekStartsOn: 1 }),
          "yyyy-MM-dd",
        );
        const bucket = sentimentByWeek.get(wk) ?? {};
        bucket[c.sentiment] = (bucket[c.sentiment] ?? 0) + 1;
        sentimentByWeek.set(wk, bucket);
      }
      const sentimentTrend = Array.from(sentimentByWeek.entries())
        .map(([week, counts]) => ({
          week,
          label: format(new Date(week), "d MMM"),
          Supportive: counts.Supportive ?? 0,
          Neutral: counts.Neutral ?? 0,
          Concerned: counts.Concerned ?? 0,
          Opposing: counts.Opposing ?? 0,
        }))
        .sort((a, b) => a.week.localeCompare(b.week));

      const respByWeek = new Map<string, Record<string, number>>();
      for (const r of responses) {
        const wk = format(
          startOfWeek(new Date(r.created_at), { weekStartsOn: 1 }),
          "yyyy-MM-dd",
        );
        const bucket = respByWeek.get(wk) ?? {};
        bucket[r.status] = (bucket[r.status] ?? 0) + 1;
        respByWeek.set(wk, bucket);
      }
      const responseTrend = Array.from(respByWeek.entries())
        .map(([week, counts]) => ({
          week,
          label: format(new Date(week), "d MMM"),
          draft: counts.draft ?? 0,
          hr_reviewed: counts.hr_reviewed ?? 0,
          exec_approved: counts.exec_approved ?? 0,
          sent: counts.sent ?? 0,
        }))
        .sort((a, b) => a.week.localeCompare(b.week));

      const totals = {
        submissions: subs.length,
        classified: classes.length,
        responses: responses.length,
        sent: responses.filter((r) => r.status === "sent" || r.sent_at).length,
      };

      return {
        totals,
        byDivision,
        byPrinciple,
        sentimentTrend,
        responseTrend,
      };
    },
  });
}

export const SENTIMENT_KEYS = SENTIMENTS;
export const RESPONSE_STATUS_KEYS = RESPONSE_STATUSES;

export const SENTIMENT_COLORS: Record<string, string> = {
  Supportive: "hsl(152 60% 45%)",
  Neutral: "hsl(220 10% 55%)",
  Concerned: "hsl(38 92% 50%)",
  Opposing: "hsl(0 72% 55%)",
};

export const RESPONSE_COLORS: Record<string, string> = {
  draft: "hsl(220 10% 60%)",
  hr_reviewed: "hsl(38 92% 55%)",
  exec_approved: "hsl(200 80% 50%)",
  sent: "hsl(152 60% 45%)",
};

export const RESPONSE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  hr_reviewed: "HR reviewed",
  exec_approved: "Exec approved",
  sent: "Sent",
};
