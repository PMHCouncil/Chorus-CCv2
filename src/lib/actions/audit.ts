"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth-server";

const AuditSchema = z.object({
  action: z.string().trim().min(1).max(120),
  entity_type: z.string().trim().min(1).max(60),
  entity_id: z.string().uuid().nullable().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type AuditInput = z.input<typeof AuditSchema>;

/**
 * Server-side audit-log writer. The only path callers can use to insert
 * audit rows — direct client INSERT was revoked by the 20260518 hardening
 * migration. The underlying SECURITY DEFINER RPC stamps user_id from
 * auth.uid() server-side, so the audit trail can no longer be forged or
 * impersonated by the browser.
 */
export async function logAuditEvent(input: AuditInput): Promise<void> {
  const data = AuditSchema.parse(input);
  const { supabase } = await requireUser();

  // Cast the RPC name: this function was added in the 20260518 hardening
  // migration and is not yet present in the supabase-generated Database
  // types. Regenerate types and drop the cast once the migration ships.
  const { error } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>)("log_audit_event", {
    _action: data.action,
    _entity_type: data.entity_type,
    _entity_id: data.entity_id ?? null,
    _details: data.details ?? {},
  });

  if (error) {
    // Don't surface internal SQL errors to the client. Server-log the full
    // message; rethrow a generic message so callers can decide whether to
    // show a toast or swallow it (most audit writes are best-effort).
    console.error("[logAuditEvent] failed:", error.message, {
      action: data.action,
      entity_type: data.entity_type,
    });
    throw new Error("Audit log write failed");
  }
}
