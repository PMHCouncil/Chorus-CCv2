import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DecisionStatus =
  | "Acknowledged"
  | "Under consideration"
  | "Change agreed"
  | "No change";

export const DECISION_STATUS_OPTIONS: DecisionStatus[] = [
  "Acknowledged",
  "Under consideration",
  "Change agreed",
  "No change",
];

export const DECISION_TONE: Record<DecisionStatus, string> = {
  Acknowledged: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
  "Under consideration":
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  "Change agreed":
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  "No change": "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
};

export interface DecisionRow {
  id: string;
  theme_id: string;
  status: DecisionStatus;
  notes: string | null;
  decided_by: string | null;
  decided_at: string;
}

export function useDecisionHistory(themeId: string | null) {
  return useQuery({
    queryKey: ["decisions", "history", themeId],
    enabled: !!themeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("decisions")
        .select("*")
        .eq("theme_id", themeId!)
        .order("decided_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DecisionRow[];
    },
  });
}

export function useLatestDecisionsByTheme() {
  return useQuery({
    queryKey: ["decisions", "latest-by-theme"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("decisions")
        .select("*")
        .order("decided_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const map = new Map<string, DecisionRow>();
      for (const row of (data ?? []) as DecisionRow[]) {
        if (!map.has(row.theme_id)) map.set(row.theme_id, row);
      }
      return map;
    },
  });
}

export function useRecordDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      themeId: string;
      status: DecisionStatus;
      notes?: string | null;
    }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("decisions")
        .insert({
          theme_id: input.themeId,
          status: input.status,
          notes: input.notes?.trim() || null,
          decided_by: userRes.user?.id ?? null,
          decided_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      if (userRes.user) {
        await supabase.from("audit_log").insert({
          user_id: userRes.user.id,
          action: "decision.recorded",
          entity_type: "theme",
          entity_id: input.themeId,
          details: { status: input.status, has_notes: !!input.notes?.trim() },
        });
      }
      return data as DecisionRow;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["decisions"] });
      qc.invalidateQueries({ queryKey: ["decisions", "history", vars.themeId] });
    },
  });
}

export interface ExecRedaction {
  id: string;
  redacted_keyword: string;
  user_id: string;
  created_at: string;
}

export function useExecRedactions() {
  return useQuery({
    queryKey: ["exec_redactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exec_redactions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ExecRedaction[];
    },
  });
}

export function useAddRedaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (keyword: string) => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error("Not signed in");
      const { error } = await supabase.from("exec_redactions").insert({
        user_id: userRes.user.id,
        redacted_keyword: keyword.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exec_redactions"] }),
  });
}

export function useRemoveRedaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("exec_redactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exec_redactions"] }),
  });
}

export function applyRedactions(text: string, keywords: string[]): string {
  if (!keywords.length) return text;
  let out = text;
  for (const kw of keywords) {
    const k = kw.trim();
    if (!k) continue;
    const re = new RegExp(escapeRegex(k), "gi");
    out = out.replace(re, "█".repeat(Math.max(3, k.length)));
  }
  return out;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
