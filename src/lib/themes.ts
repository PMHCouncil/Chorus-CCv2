import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mergeThemes } from "@/lib/actions/themes";
import type { Sentiment } from "./classify";

export interface ThemeRow {
  id: string;
  name: string;
  summary: string | null;
  description: string | null;
  submission_count: number;
  created_at: string;
}

export interface ThemeWithSentiment extends ThemeRow {
  sentiment_breakdown: Record<Sentiment | "Unclassified", number>;
}

export interface ThemeMember {
  submission_id: string;
  confidence: number | null;
  submission: {
    id: string;
    submitter_name: string | null;
    submitter_role: string | null;
    content: string;
    submitted_at: string;
    status: string;
  };
  classification: {
    sentiment: Sentiment | null;
    divisions: string[];
  } | null;
}

const EMPTY_BREAKDOWN: Record<Sentiment | "Unclassified", number> = {
  Supportive: 0,
  Neutral: 0,
  Concerned: 0,
  Opposing: 0,
  Unclassified: 0,
};

export function useThemesWithBreakdown() {
  return useQuery({
    queryKey: ["themes", "with-breakdown"],
    queryFn: async (): Promise<ThemeWithSentiment[]> => {
      const { data: themes, error } = await supabase
        .from("themes")
        .select("*")
        .order("submission_count", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;

      const themeRows = (themes ?? []) as ThemeRow[];
      if (themeRows.length === 0) return [];

      const themeIds = themeRows.map((t) => t.id);
      const { data: links, error: linkErr } = await supabase
        .from("submission_themes")
        .select("theme_id, submission_id")
        .in("theme_id", themeIds);
      if (linkErr) throw linkErr;

      const submissionIds = Array.from(
        new Set((links ?? []).map((l) => l.submission_id)),
      );
      let classMap = new Map<string, Sentiment | null>();
      if (submissionIds.length > 0) {
        const { data: classRows, error: classErr } = await supabase
          .from("classifications")
          .select("submission_id, sentiment")
          .in("submission_id", submissionIds);
        if (classErr) throw classErr;
        classMap = new Map(
          (classRows ?? []).map((r) => [
            r.submission_id as string,
            r.sentiment as Sentiment | null,
          ]),
        );
      }

      const breakdownByTheme = new Map<string, Record<Sentiment | "Unclassified", number>>();
      for (const t of themeRows) breakdownByTheme.set(t.id, { ...EMPTY_BREAKDOWN });
      for (const l of links ?? []) {
        const bucket = breakdownByTheme.get(l.theme_id as string);
        if (!bucket) continue;
        const s = classMap.get(l.submission_id as string) ?? null;
        if (s) bucket[s] += 1;
        else bucket.Unclassified += 1;
      }

      return themeRows.map((t) => ({
        ...t,
        sentiment_breakdown: breakdownByTheme.get(t.id) ?? { ...EMPTY_BREAKDOWN },
      }));
    },
  });
}

export function useTheme(themeId: string | null) {
  return useQuery({
    queryKey: ["theme", themeId],
    enabled: !!themeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("themes")
        .select("*")
        .eq("id", themeId!)
        .maybeSingle();
      if (error) throw error;
      return (data as ThemeRow | null) ?? null;
    },
  });
}

export function useThemeMembers(themeId: string | null) {
  return useQuery({
    queryKey: ["theme-members", themeId],
    enabled: !!themeId,
    queryFn: async (): Promise<ThemeMember[]> => {
      const { data: links, error } = await supabase
        .from("submission_themes")
        .select(
          "submission_id, confidence, submissions(id, submitter_name, submitter_role, content, submitted_at, status)",
        )
        .eq("theme_id", themeId!);
      if (error) throw error;

      const submissionIds = (links ?? []).map((l) => l.submission_id as string);
      let classMap = new Map<string, { sentiment: Sentiment | null; divisions: string[] }>();
      if (submissionIds.length > 0) {
        const { data: classRows, error: classErr } = await supabase
          .from("classifications")
          .select("submission_id, sentiment, divisions")
          .in("submission_id", submissionIds);
        if (classErr) throw classErr;
        classMap = new Map(
          (classRows ?? []).map((r) => [
            r.submission_id as string,
            {
              sentiment: r.sentiment as Sentiment | null,
              divisions: (r.divisions as string[] | null) ?? [],
            },
          ]),
        );
      }

      return (links ?? [])
        .filter((l) => l.submissions)
        .map((l) => ({
          submission_id: l.submission_id as string,
          confidence: (l.confidence as number | null) ?? null,
          submission: l.submissions as ThemeMember["submission"],
          classification: classMap.get(l.submission_id as string) ?? null,
        }))
        .sort(
          (a, b) =>
            new Date(b.submission.submitted_at).getTime() -
            new Date(a.submission.submitted_at).getTime(),
        );
    },
  });
}

export function useUpdateTheme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      patch: Partial<Pick<ThemeRow, "name" | "summary" | "description">>;
    }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.from("themes").update(input.patch).eq("id", input.id);
      if (error) throw error;
      await supabase.from("audit_log").insert({
        user_id: userRes.user?.id ?? null,
        action: "theme.updated",
        entity_type: "theme",
        entity_id: input.id,
        details: input.patch,
      });
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["themes"] });
      qc.invalidateQueries({ queryKey: ["theme", vars.id] });
    },
  });
}

export function useDeleteTheme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (themeId: string) => {
      const { data: userRes } = await supabase.auth.getUser();
      const { error: linkErr } = await supabase
        .from("submission_themes")
        .delete()
        .eq("theme_id", themeId);
      if (linkErr) throw linkErr;
      const { error } = await supabase.from("themes").delete().eq("id", themeId);
      if (error) throw error;
      await supabase.from("audit_log").insert({
        user_id: userRes.user?.id ?? null,
        action: "theme.deleted",
        entity_type: "theme",
        entity_id: themeId,
        details: {},
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["themes"] });
    },
  });
}

export function useUnlinkThemeMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { themeId: string; submissionId: string }) => {
      const { error } = await supabase
        .from("submission_themes")
        .delete()
        .eq("theme_id", input.themeId)
        .eq("submission_id", input.submissionId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["theme-members", vars.themeId] });
      qc.invalidateQueries({ queryKey: ["themes"] });
      qc.invalidateQueries({ queryKey: ["submission-themes", vars.submissionId] });
    },
  });
}

export function useMergeThemes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sourceId: string; targetId: string }) => mergeThemes(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["themes"] });
      qc.invalidateQueries({ queryKey: ["theme-members"] });
      qc.invalidateQueries({ queryKey: ["submission-themes"] });
    },
  });
}
