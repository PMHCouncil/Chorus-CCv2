import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { classifySubmission } from "@/lib/actions/classify";

export type Sentiment = "Supportive" | "Neutral" | "Concerned" | "Opposing";
export type Division =
  | "Corporate Services"
  | "Community Planning & Environment"
  | "Community Infrastructure"
  | "Community Utilities"
  | "Multiple"
  | "N/A";
export type FeedbackType =
  | "Placement"
  | "Role design"
  | "Transition concern"
  | "Principles"
  | "FAQ-able question"
  | "Other";
export type PrincipleTag =
  | "Customer focus"
  | "Business sustainability"
  | "Alignment with strategy"
  | "Flexibility agility and balance"
  | "Improving efficiency and reducing duplication"
  | "Reducing risk"
  | "Maintaining workforce engagement";

export interface Classification {
  id: string;
  submission_id: string;
  sentiment: Sentiment | null;
  divisions: string[];
  feedback_types: string[];
  principle_tags: string[];
  roles_affected: string[];
  ai_confidence: number | null;
  human_verified: boolean;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
}

export interface ThemeRow {
  id: string;
  name: string;
  summary: string | null;
  description: string | null;
  submission_count: number;
  created_at: string;
}

export function useClassification(submissionId: string | null) {
  return useQuery({
    queryKey: ["classification", submissionId],
    enabled: !!submissionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classifications")
        .select("*")
        .eq("submission_id", submissionId!)
        .maybeSingle();
      if (error) throw error;
      return (data as Classification | null) ?? null;
    },
  });
}

export function useSubmissionThemes(submissionId: string | null) {
  return useQuery({
    queryKey: ["submission-themes", submissionId],
    enabled: !!submissionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("submission_themes")
        .select("theme_id, confidence, themes(id, name, summary)")
        .eq("submission_id", submissionId!);
      if (error) throw error;
      return (data ?? []) as Array<{
        theme_id: string;
        confidence: number | null;
        themes: { id: string; name: string; summary: string | null } | null;
      }>;
    },
  });
}

export function useThemes() {
  return useQuery({
    queryKey: ["themes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("themes")
        .select("*")
        .order("submission_count", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ThemeRow[];
    },
  });
}

export function useClassifySubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (submissionId: string) => {
      return await classifySubmission({ submissionId });
    },
    onSuccess: (_data, submissionId) => {
      qc.invalidateQueries({ queryKey: ["classification", submissionId] });
      qc.invalidateQueries({ queryKey: ["submission-themes", submissionId] });
      qc.invalidateQueries({ queryKey: ["submission", submissionId] });
      qc.invalidateQueries({ queryKey: ["submissions"] });
      qc.invalidateQueries({ queryKey: ["themes"] });
    },
  });
}

export function useVerifyClassification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      classificationId: string;
      patch: Partial<Pick<
        Classification,
        "sentiment" | "divisions" | "feedback_types" | "principle_tags" | "roles_affected"
      >>;
    }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("classifications")
        .update({
          ...input.patch,
          human_verified: true,
          verified_at: new Date().toISOString(),
          verified_by: userRes.user?.id ?? null,
        })
        .eq("id", input.classificationId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classification"] });
      qc.invalidateQueries({ queryKey: ["submissions"] });
    },
  });
}

export const SENTIMENT_OPTIONS: Sentiment[] = [
  "Supportive",
  "Neutral",
  "Concerned",
  "Opposing",
];
export const DIVISION_OPTIONS: Division[] = [
  "Corporate Services",
  "Community Planning & Environment",
  "Community Infrastructure",
  "Community Utilities",
  "Multiple",
  "N/A",
];
export const FEEDBACK_TYPE_OPTIONS: FeedbackType[] = [
  "Placement",
  "Role design",
  "Transition concern",
  "Principles",
  "FAQ-able question",
  "Other",
];
export const PRINCIPLE_TAG_OPTIONS: PrincipleTag[] = [
  "Customer focus",
  "Business sustainability",
  "Alignment with strategy",
  "Flexibility agility and balance",
  "Improving efficiency and reducing duplication",
  "Reducing risk",
  "Maintaining workforce engagement",
];

export const SENTIMENT_TONE: Record<Sentiment, string> = {
  Supportive: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  Neutral: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
  Concerned: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  Opposing: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
};
