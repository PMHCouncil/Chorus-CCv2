import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { classifySubmission } from "@/lib/actions/classify";

export type SubmissionSource = "form" | "email" | "cc" | "other";
export type SubmissionStatus = "new" | "classified" | "themed" | "responded" | "sent";

export interface Submission {
  id: string;
  source: SubmissionSource;
  status: SubmissionStatus;
  submitter_name: string | null;
  submitter_email: string | null;
  submitter_role: string | null;
  content: string;
  raw_data: Record<string, unknown> | null;
  submitted_at: string;
  created_at: string;
  created_by: string | null;
  assigned_to: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
  archived_at: string | null;
}

export interface StaffMember {
  id: string;
  display_name: string | null;
  email: string | null;
  roles?: string[];
}

export type ArchivedFilter = "active" | "archived" | "all";

export interface SubmissionFilters {
  search?: string;
  status?: SubmissionStatus | "all";
  source?: SubmissionSource | "all";
  division?: string | "all";
  feedbackType?: string | "all";
  principleTag?: string | "all";
  roleAffected?: string;
  assignee?: string | "all" | "unassigned";
  archived?: ArchivedFilter;
}

export function useSubmissions(filters: SubmissionFilters = {}) {
  return useQuery({
    queryKey: ["submissions", filters],
    queryFn: async () => {
      const needClassFilter =
        (filters.division && filters.division !== "all") ||
        (filters.feedbackType && filters.feedbackType !== "all") ||
        (filters.principleTag && filters.principleTag !== "all") ||
        (filters.roleAffected && filters.roleAffected.trim());

      let allowedIds: string[] | null = null;
      if (needClassFilter) {
        let cq = supabase.from("classifications").select("submission_id");
        if (filters.division && filters.division !== "all") {
          cq = cq.contains("divisions", [filters.division]);
        }
        if (filters.feedbackType && filters.feedbackType !== "all") {
          cq = cq.contains("feedback_types", [filters.feedbackType]);
        }
        if (filters.principleTag && filters.principleTag !== "all") {
          cq = cq.contains("principle_tags", [filters.principleTag]);
        }
        if (filters.roleAffected && filters.roleAffected.trim()) {
          cq = cq.contains("roles_affected", [filters.roleAffected.trim()]);
        }
        const { data: rows, error: cErr } = await cq.limit(2000);
        if (cErr) throw cErr;
        allowedIds = (rows ?? []).map((r) => r.submission_id as string);
        if (allowedIds.length === 0) return [];
      }

      let query = supabase
        .from("submissions")
        .select("*")
        .order("submitted_at", { ascending: false })
        .limit(500);

      if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
      if (filters.source && filters.source !== "all") query = query.eq("source", filters.source);
      if (allowedIds) query = query.in("id", allowedIds);

      const archived = filters.archived ?? "active";
      if (archived === "active") query = query.is("archived_at", null);
      else if (archived === "archived") query = query.not("archived_at", "is", null);

      if (filters.assignee && filters.assignee !== "all") {
        if (filters.assignee === "unassigned") query = query.is("assigned_to", null);
        else query = query.eq("assigned_to", filters.assignee);
      }

      if (filters.search && filters.search.trim()) {
        const s = filters.search.trim().replace(/[%_]/g, "");
        query = query.or(
          `content.ilike.%${s}%,submitter_name.ilike.%${s}%,submitter_email.ilike.%${s}%`,
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Submission[];
    },
  });
}

export function useSubmission(id: string | null) {
  return useQuery({
    queryKey: ["submission", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("submissions")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as Submission;
    },
  });
}

export interface NewSubmissionInput {
  source: SubmissionSource;
  submitter_name?: string;
  submitter_email?: string;
  submitter_role?: string;
  content: string;
  submitted_at?: string;
}

export function useCreateSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewSubmissionInput) => {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id ?? null;

      const payload = {
        source: input.source,
        submitter_name: input.submitter_name?.trim() || null,
        submitter_email: input.submitter_email?.trim() || null,
        submitter_role: input.submitter_role?.trim() || null,
        content: input.content.trim(),
        submitted_at: input.submitted_at ?? new Date().toISOString(),
        created_by: userId,
        status: "new" as const,
      };

      const { data, error } = await supabase
        .from("submissions")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;

      if (userId) {
        await supabase.from("audit_log").insert({
          user_id: userId,
          action: "submission.created",
          entity_type: "submission",
          entity_id: data.id,
          details: { source: payload.source },
        });
      }

      return data as Submission;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["submissions"] });
    },
  });
}

export function useDeleteSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("submissions").delete().eq("id", id);
      if (error) throw error;
      const { data: userRes } = await supabase.auth.getUser();
      if (userRes.user) {
        await supabase.from("audit_log").insert({
          user_id: userRes.user.id,
          action: "submission.deleted",
          entity_type: "submission",
          entity_id: id,
        });
      }
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["submissions"] });
    },
  });
}

export interface SubmitterPatch {
  submitter_name?: string | null;
  submitter_email?: string | null;
  submitter_role?: string | null;
}

export function useUpdateSubmitter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: SubmitterPatch }) => {
      const { data: current, error: loadErr } = await supabase
        .from("submissions")
        .select("raw_data")
        .eq("id", id)
        .single();
      if (loadErr) throw loadErr;

      const rawData = ((current?.raw_data as Record<string, unknown> | null) ?? {}) as Record<
        string,
        unknown
      >;
      const prevEnriched = Array.isArray(rawData.enriched_sender_fields)
        ? (rawData.enriched_sender_fields as string[])
        : [];
      const editedKeys = Object.keys(patch);
      const nextEnriched = prevEnriched.filter((f) => !editedKeys.includes(f));
      const nextRawData = { ...rawData, enriched_sender_fields: nextEnriched };

      const normalised: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(patch)) {
        normalised[k] = typeof v === "string" ? v.trim() || null : (v ?? null);
      }

      const { error } = await supabase
        .from("submissions")
        .update({ ...normalised, raw_data: nextRawData as never })
        .eq("id", id);
      if (error) throw error;

      const { data: userRes } = await supabase.auth.getUser();
      if (userRes.user) {
        await supabase.from("audit_log").insert({
          user_id: userRes.user.id,
          action: "submission.submitter_updated",
          entity_type: "submission",
          entity_id: id,
          details: { fields: editedKeys },
        });
      }
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["submission", id] });
      qc.invalidateQueries({ queryKey: ["submissions"] });
    },
  });
}

export const SOURCE_LABELS: Record<SubmissionSource, string> = {
  form: "Online Form",
  email: "Email",
  cc: "CC / Forward",
  other: "Other",
};

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  new: "New",
  classified: "Classified",
  themed: "Themed",
  responded: "Responded",
  sent: "Sent",
};

export function useStaffMembers() {
  return useQuery({
    queryKey: ["staff-members"],
    queryFn: async () => {
      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (rErr) throw rErr;
      const rolesByUser = new Map<string, string[]>();
      for (const r of roles ?? []) {
        const uid = r.user_id as string;
        const arr = rolesByUser.get(uid) ?? [];
        arr.push(r.role as string);
        rolesByUser.set(uid, arr);
      }
      const ids = Array.from(rolesByUser.keys());
      if (ids.length === 0) return [] as StaffMember[];
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", ids);
      if (pErr) throw pErr;
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: rolesByUser.get(p.id) ?? [],
      })) as StaffMember[];
    },
  });
}

async function logAudit(
  action: string,
  entityIds: string[],
  details: Record<string, unknown> = {},
) {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return;
  const rows = entityIds.map((id) => ({
    user_id: userRes.user!.id,
    action,
    entity_type: "submission",
    entity_id: id,
    details: details as never,
  }));
  if (rows.length) await supabase.from("audit_log").insert(rows);
}

export function useBulkAssign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { ids: string[]; assigneeId: string | null }) => {
      const { error } = await supabase.rpc("assign_submissions", {
        _ids: input.ids,
        _assignee: input.assigneeId,
      } as never);
      if (error) throw error;
      return input.ids;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["submissions"] });
      vars.ids.forEach((id) => qc.invalidateQueries({ queryKey: ["submission", id] }));
      qc.invalidateQueries({ queryKey: ["assignment-stats"] });
    },
  });
}

export function useBulkArchive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { ids: string[]; archived: boolean }) => {
      const { error } = await supabase
        .from("submissions")
        .update({ archived_at: input.archived ? new Date().toISOString() : null })
        .in("id", input.ids);
      if (error) throw error;
      await logAudit(
        input.archived ? "submission.archived" : "submission.unarchived",
        input.ids,
      );
      return input.ids;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["submissions"] }),
  });
}

export function useBulkClassify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const results: { id: string; ok: boolean; error?: string }[] = [];
      for (const id of ids) {
        try {
          await classifySubmission({ submissionId: id });
          results.push({ id, ok: true });
        } catch (e) {
          results.push({
            id,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      return results;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["submissions"] });
      qc.invalidateQueries({ queryKey: ["classification"] });
      qc.invalidateQueries({ queryKey: ["themes"] });
    },
  });
}
