import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { draftResponse } from "@/lib/actions/responses";
import type { FlowStep, FlowTimestamps } from "@/components/submissions/submission-flow";

export type ResponseStatus = "draft" | "hr_reviewed" | "exec_approved" | "sent";

const FLOW_AUDIT_MAP: Record<string, FlowStep> = {
  "submission.created": "new",
  "submission.classified": "classified",
  "response.drafted": "draft",
  "response.hr_reviewed": "hr_reviewed",
  "response.exec_approved": "exec_approved",
  "response.sent": "sent",
};

/**
 * Pulls the latest timestamp for each pipeline step from the audit log,
 * so step tooltips can show when each milestone was reached. Returns an
 * empty map until both ids are known.
 */
export function useFlowTimestamps(
  submissionId: string | null | undefined,
  responseId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["flow-timestamps", submissionId, responseId],
    enabled: !!submissionId,
    queryFn: async () => {
      const entityIds: string[] = [];
      if (submissionId) entityIds.push(submissionId);
      if (responseId) entityIds.push(responseId);

      const { data, error } = await supabase
        .from("audit_log")
        .select("action, entity_id, created_at")
        .in("entity_id", entityIds)
        .in("action", Object.keys(FLOW_AUDIT_MAP))
        .order("created_at", { ascending: true });
      if (error) throw error;

      const out: FlowTimestamps = {};
      for (const row of data ?? []) {
        const step = FLOW_AUDIT_MAP[row.action as string];
        if (!step) continue;
        // Keep the earliest occurrence per step — that's the moment it was reached.
        if (!out[step]) out[step] = row.created_at as string;
      }
      return out;
    },
  });
}

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

/**
 * Per-user "what's on my plate" counts shown on the dashboard. Returns
 * one number per actionable bucket. Each query is a HEAD count, so the
 * payload is small. Approval / ready-to-send buckets are global (any
 * approver / any sender can clear them).
 */
export function useMyWorkStats(userId: string | undefined) {
  return useQuery({
    queryKey: ["my-work-stats", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [assigned, myDrafts, awaitingApproval, readyToSend] = await Promise.all([
        supabase
          .from("submissions")
          .select("id", { count: "exact", head: true })
          .eq("assigned_to", userId!)
          .is("archived_at", null)
          .neq("status", "sent"),
        supabase
          .from("responses")
          .select("id", { count: "exact", head: true })
          .eq("reviewer", userId!)
          .eq("status", "draft"),
        supabase
          .from("responses")
          .select("id", { count: "exact", head: true })
          .eq("status", "hr_reviewed"),
        supabase
          .from("responses")
          .select("id", { count: "exact", head: true })
          .eq("status", "exec_approved"),
      ]);
      const firstError =
        assigned.error || myDrafts.error || awaitingApproval.error || readyToSend.error;
      if (firstError) throw firstError;
      return {
        assigned: assigned.count ?? 0,
        myDrafts: myDrafts.count ?? 0,
        awaitingApproval: awaitingApproval.count ?? 0,
        readyToSend: readyToSend.count ?? 0,
      };
    },
  });
}

/**
 * Pipeline counts grouped onto the unified 6-step flow. Submissions that
 * don't yet have a response contribute to `new` / `classified`; responses
 * contribute to `draft` / `hr_reviewed` / `exec_approved` / `sent`.
 */
export function usePipelineCounts() {
  return useQuery({
    queryKey: ["pipeline-counts"],
    queryFn: async () => {
      const [newCount, classifiedCount, draft, hrReviewed, execApproved, sent] =
        await Promise.all([
          supabase
            .from("submissions")
            .select("id", { count: "exact", head: true })
            .eq("status", "new")
            .is("archived_at", null),
          supabase
            .from("submissions")
            .select("id", { count: "exact", head: true })
            .in("status", ["classified", "themed"])
            .is("archived_at", null),
          supabase
            .from("responses")
            .select("id", { count: "exact", head: true })
            .eq("status", "draft"),
          supabase
            .from("responses")
            .select("id", { count: "exact", head: true })
            .eq("status", "hr_reviewed"),
          supabase
            .from("responses")
            .select("id", { count: "exact", head: true })
            .eq("status", "exec_approved"),
          supabase
            .from("responses")
            .select("id", { count: "exact", head: true })
            .eq("status", "sent"),
        ]);
      const firstError =
        newCount.error ||
        classifiedCount.error ||
        draft.error ||
        hrReviewed.error ||
        execApproved.error ||
        sent.error;
      if (firstError) throw firstError;
      return {
        new: newCount.count ?? 0,
        classified: classifiedCount.count ?? 0,
        draft: draft.count ?? 0,
        hr_reviewed: hrReviewed.count ?? 0,
        exec_approved: execApproved.count ?? 0,
        sent: sent.count ?? 0,
      } satisfies Record<FlowStep, number>;
    },
  });
}

export interface StuckResponseRow {
  id: string;
  submission_id: string;
  status: ResponseStatus;
  last_transition_at: string;
  days_stuck: number;
  submitter_name: string | null;
}

const STATUS_TRANSITION_ACTION: Record<ResponseStatus, string> = {
  draft: "response.drafted",
  hr_reviewed: "response.hr_reviewed",
  exec_approved: "response.exec_approved",
  sent: "response.sent",
};

/**
 * Responses that have sat at the same non-terminal step for `thresholdDays`
 * or more. The clock starts when the response *entered* its current status
 * (looked up from audit_log); we fall back to the response's `created_at`
 * if no transition row exists (e.g. legacy data).
 */
export function useStuckResponses(thresholdDays = 5) {
  return useQuery({
    queryKey: ["stuck-responses", thresholdDays],
    queryFn: async () => {
      const { data: responses, error: rErr } = await supabase
        .from("responses")
        .select("id, submission_id, status, created_at, submissions(submitter_name)")
        .neq("status", "sent")
        .limit(500);
      if (rErr) throw rErr;
      if (!responses || responses.length === 0) return [];

      const ids = responses.map((r) => r.id as string);
      const { data: audits, error: aErr } = await supabase
        .from("audit_log")
        .select("entity_id, action, created_at")
        .in("entity_id", ids)
        .in("action", Object.values(STATUS_TRANSITION_ACTION))
        .order("created_at", { ascending: false });
      if (aErr) throw aErr;

      const latestByKey = new Map<string, string>();
      for (const a of audits ?? []) {
        const key = `${a.entity_id as string}::${a.action as string}`;
        if (!latestByKey.has(key)) {
          latestByKey.set(key, a.created_at as string);
        }
      }

      const now = Date.now();
      const cutoffMs = thresholdDays * 24 * 60 * 60 * 1000;
      const rows: StuckResponseRow[] = [];
      for (const r of responses) {
        const status = r.status as ResponseStatus;
        const want = STATUS_TRANSITION_ACTION[status];
        const referenceTs =
          latestByKey.get(`${r.id}::${want}`) ?? (r.created_at as string);
        const ageMs = now - new Date(referenceTs).getTime();
        if (ageMs < cutoffMs) continue;
        const sub = r.submissions as { submitter_name: string | null } | null;
        rows.push({
          id: r.id as string,
          submission_id: r.submission_id as string,
          status,
          last_transition_at: referenceTs,
          days_stuck: Math.floor(ageMs / (24 * 60 * 60 * 1000)),
          submitter_name: sub?.submitter_name ?? null,
        });
      }
      rows.sort((a, b) => b.days_stuck - a.days_stuck);
      return rows.slice(0, 20);
    },
  });
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
