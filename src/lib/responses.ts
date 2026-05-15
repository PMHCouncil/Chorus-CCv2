import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { draftResponse } from "@/lib/actions/responses";

export type ResponseStatus = "draft" | "hr_reviewed" | "exec_approved" | "sent";

export interface ResponseRow {
  id: string;
  submission_id: string;
  draft_text: string;
  status: ResponseStatus;
  reviewer: string | null;
  approved_by: string | null;
  sent_at: string | null;
  notes: string | null;
  change_made: boolean;
  created_at: string;
}

export const RESPONSE_STATUS_LABELS: Record<ResponseStatus, string> = {
  draft: "Draft",
  hr_reviewed: "HR reviewed",
  exec_approved: "Exec approved",
  sent: "Sent",
};

export function useResponseForSubmission(submissionId: string | null) {
  return useQuery({
    queryKey: ["response", submissionId],
    enabled: !!submissionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("responses")
        .select("*")
        .eq("submission_id", submissionId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as ResponseRow | null) ?? null;
    },
  });
}

export interface ResponseListFilters {
  status?: ResponseStatus | "all";
  search?: string;
}

export interface ResponseListItem extends ResponseRow {
  submissions: {
    id: string;
    content: string;
    submitter_name: string | null;
    submitter_email: string | null;
    submitter_role: string | null;
  } | null;
}

export function useResponses(filters: ResponseListFilters = {}) {
  return useQuery({
    queryKey: ["responses", filters],
    queryFn: async () => {
      let q = supabase
        .from("responses")
        .select(
          "*, submissions(id, content, submitter_name, submitter_email, submitter_role)",
        )
        .order("created_at", { ascending: false })
        .limit(300);
      if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []) as ResponseListItem[];
      if (filters.search?.trim()) {
        const s = filters.search.trim().toLowerCase();
        rows = rows.filter(
          (r) =>
            r.draft_text.toLowerCase().includes(s) ||
            r.submissions?.submitter_name?.toLowerCase().includes(s) ||
            r.submissions?.submitter_email?.toLowerCase().includes(s) ||
            r.submissions?.content.toLowerCase().includes(s),
        );
      }
      return rows;
    },
  });
}

export function useDraftResponse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (submissionId: string) => draftResponse({ submissionId }),
    onSuccess: (_d, submissionId) => {
      qc.invalidateQueries({ queryKey: ["response", submissionId] });
      qc.invalidateQueries({ queryKey: ["responses"] });
    },
  });
}

export function useUpdateResponseDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      draft_text: string;
      notes?: string | null;
      change_made?: boolean;
    }) => {
      const { error } = await supabase
        .from("responses")
        .update({
          draft_text: input.draft_text,
          notes: input.notes ?? null,
          change_made: input.change_made ?? false,
        })
        .eq("id", input.id);
      if (error) throw error;
      const { data: userRes } = await supabase.auth.getUser();
      if (userRes.user) {
        await supabase.from("audit_log").insert({
          user_id: userRes.user.id,
          action: "response.updated",
          entity_type: "response",
          entity_id: input.id,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["response"] });
      qc.invalidateQueries({ queryKey: ["responses"] });
    },
  });
}

export function useReviewResponse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string }) => {
      const { error } = await supabase
        .from("responses")
        .update({ status: "hr_reviewed" })
        .eq("id", input.id);
      if (error) throw error;
      const { data: userRes } = await supabase.auth.getUser();
      if (userRes.user) {
        await supabase.from("audit_log").insert({
          user_id: userRes.user.id,
          action: "response.hr_reviewed",
          entity_type: "response",
          entity_id: input.id,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["response"] });
      qc.invalidateQueries({ queryKey: ["responses"] });
    },
  });
}

export function useApproveResponse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; submissionId: string }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("responses")
        .update({ status: "exec_approved", approved_by: userRes.user?.id ?? null })
        .eq("id", input.id);
      if (error) throw error;
      await supabase
        .from("submissions")
        .update({ status: "responded" })
        .eq("id", input.submissionId);
      if (userRes.user) {
        await supabase.from("audit_log").insert({
          user_id: userRes.user.id,
          action: "response.exec_approved",
          entity_type: "response",
          entity_id: input.id,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["response"] });
      qc.invalidateQueries({ queryKey: ["responses"] });
      qc.invalidateQueries({ queryKey: ["submissions"] });
    },
  });
}

export function useMarkResponseSent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; submissionId: string }) => {
      const { error } = await supabase
        .from("responses")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw error;
      await supabase
        .from("submissions")
        .update({ status: "sent" })
        .eq("id", input.submissionId);
      const { data: userRes } = await supabase.auth.getUser();
      if (userRes.user) {
        await supabase.from("audit_log").insert({
          user_id: userRes.user.id,
          action: "response.sent",
          entity_type: "response",
          entity_id: input.id,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["response"] });
      qc.invalidateQueries({ queryKey: ["responses"] });
      qc.invalidateQueries({ queryKey: ["submissions"] });
    },
  });
}

export function useReopenResponse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("responses")
        .update({ status: "draft", approved_by: null, sent_at: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["response"] });
      qc.invalidateQueries({ queryKey: ["responses"] });
    },
  });
}
