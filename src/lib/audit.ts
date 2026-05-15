import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getAdminAuditLog } from "@/lib/actions/users";
import { useAuth, isAdminOnly } from "@/lib/auth";

export interface AuditEntry {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  actor_email?: string | null;
  actor_name?: string | null;
}

export interface AuditFilters {
  search?: string;
  action?: string;
  entityType?: string;
  userId?: string;
  from?: string;
  to?: string;
}

export function useAuditLog(filters: AuditFilters = {}) {
  const { roles } = useAuth();
  const adminOnly = isAdminOnly(roles);
  return useQuery({
    queryKey: ["audit_log", filters, adminOnly],
    queryFn: async () => {
      let rows: AuditEntry[];
      if (adminOnly) {
        const res = await getAdminAuditLog();
        rows = (res.entries ?? []) as AuditEntry[];
        if (filters.action && filters.action !== "all")
          rows = rows.filter((r) => r.action === filters.action);
        if (filters.entityType && filters.entityType !== "all")
          rows = rows.filter((r) => r.entity_type === filters.entityType);
        if (filters.userId && filters.userId !== "all")
          rows = rows.filter((r) => r.user_id === filters.userId);
        if (filters.from) rows = rows.filter((r) => r.created_at >= filters.from!);
        if (filters.to) rows = rows.filter((r) => r.created_at <= filters.to!);
      } else {
        let query = supabase
          .from("audit_log")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500);

        if (filters.action && filters.action !== "all") query = query.eq("action", filters.action);
        if (filters.entityType && filters.entityType !== "all")
          query = query.eq("entity_type", filters.entityType);
        if (filters.userId && filters.userId !== "all")
          query = query.eq("user_id", filters.userId);
        if (filters.from) query = query.gte("created_at", filters.from);
        if (filters.to) query = query.lte("created_at", filters.to);

        const { data, error } = await query;
        if (error) throw error;
        rows = (data ?? []) as AuditEntry[];
      }

      const userIds = Array.from(
        new Set(rows.map((r) => r.user_id).filter((v): v is string => Boolean(v))),
      );
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", userIds);
        const map = new Map((profiles ?? []).map((p) => [p.id, p]));
        for (const r of rows) {
          const p = r.user_id ? map.get(r.user_id) : undefined;
          r.actor_email = p?.email ?? null;
          r.actor_name = p?.display_name ?? null;
        }
      }

      const term = filters.search?.trim().toLowerCase();
      if (term) {
        return rows.filter((r) =>
          [
            r.action,
            r.entity_type,
            r.entity_id ?? "",
            r.actor_email ?? "",
            r.actor_name ?? "",
            JSON.stringify(r.details ?? {}),
          ]
            .join(" ")
            .toLowerCase()
            .includes(term),
        );
      }
      return rows;
    },
  });
}

export function useAuditFacets() {
  return useQuery({
    queryKey: ["audit_log_facets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("action, entity_type, user_id")
        .limit(2000);
      if (error) throw error;
      const actions = new Set<string>();
      const entityTypes = new Set<string>();
      const userIds = new Set<string>();
      for (const r of data ?? []) {
        if (r.action) actions.add(r.action);
        if (r.entity_type) entityTypes.add(r.entity_type);
        if (r.user_id) userIds.add(r.user_id);
      }
      let userOptions: { id: string; label: string }[] = [];
      if (userIds.size > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", Array.from(userIds));
        userOptions = (profiles ?? []).map((p) => ({
          id: p.id,
          label: p.display_name ?? p.email ?? p.id.slice(0, 8),
        }));
      }
      return {
        actions: Array.from(actions).sort(),
        entityTypes: Array.from(entityTypes).sort(),
        users: userOptions.sort((a, b) => a.label.localeCompare(b.label)),
      };
    },
  });
}
