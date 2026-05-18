"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth-server";
import { logAuditEvent } from "@/lib/actions/audit";

// Whitelist of settings keys the admin UI is allowed to write. Constrains the
// blast radius if a future UI gets compromised — only these keys can be
// changed via this server action.
const ALLOWED_KEYS = [
  "classifier_system_prompt",
  "classifier_model",
  "responder_system_prompt",
  "developer_mode_enabled",
] as const;

const SettingEntry = z.object({
  key: z.enum(ALLOWED_KEYS),
  value: z.string().max(50_000),
});

const SetAppSettingsSchema = z.object({
  entries: z.array(SettingEntry).min(1).max(20),
});

export type SetAppSettingsInput = z.input<typeof SetAppSettingsSchema>;

/**
 * Admin-only writer for `app_settings`. Replaces the direct anon-client
 * upsert that lived in the settings page — that path relied solely on RLS
 * for authorization, which is defense-in-depth-thin for system-prompt
 * mutations (a successful write can repurpose every classifier/responder
 * call against every user's data).
 *
 * Guards:
 *  - requireAdmin (server-verified role check before any DB write)
 *  - key whitelist (Zod enum)
 *  - value length cap (50KB per setting)
 *  - audit row written via log_audit_event RPC
 */
export async function setAppSettings(input: SetAppSettingsInput) {
  const data = SetAppSettingsSchema.parse(input);
  const { supabase, userId } = await requireAdmin();

  const ts = new Date().toISOString();
  const rows = data.entries.map((e) => ({
    key: e.key,
    value: e.value,
    updated_by: userId,
    updated_at: ts,
  }));

  const { error } = await supabase
    .from("app_settings")
    .upsert(rows, { onConflict: "key" });
  if (error) {
    console.error("[setAppSettings] failed:", error.message);
    throw new Error("Failed to save settings");
  }

  await logAuditEvent({
    action: "app_settings.updated",
    entity_type: "app_settings",
    entity_id: null,
    details: { keys: data.entries.map((e) => e.key) },
  });

  return { ok: true as const };
}
