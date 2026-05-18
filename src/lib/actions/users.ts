"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth-server";

const ROLE_VALUES = [
  "admin",
  "hr",
  "exec",
  "gm",
  "gm_ea",
  "director",
  "group_manager",
] as const;

type AppRole = (typeof ROLE_VALUES)[number];

export interface ManagedUser {
  id: string;
  email: string;
  display_name: string | null;
  roles: AppRole[];
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  invited_at: string | null;
  email_confirmed_at: string | null;
}

async function logAudit(
  supabaseAdmin: Awaited<ReturnType<typeof requireAdmin>>["supabaseAdmin"],
  actorId: string,
  action: string,
  entityId: string | null,
  details: Record<string, unknown>,
) {
  await supabaseAdmin.from("audit_log").insert({
    user_id: actorId,
    action,
    entity_type: "user",
    entity_id: entityId,
    details: details as never,
  });
}

export async function listUsers(): Promise<{
  users: ManagedUser[];
  debug?: string;
}> {
  try {
    const { supabaseAdmin } = await requireAdmin();

    const all: Array<{
      id: string;
      email?: string;
      created_at: string;
      last_sign_in_at?: string | null;
      invited_at?: string | null;
      email_confirmed_at?: string | null;
      user_metadata?: { display_name?: string };
      banned_until?: string | null;
    }> = [];
    let page = 1;
    const perPage = 200;
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      });
      if (error)
        throw new Error(`auth.admin.listUsers failed: ${error.message}`);
      all.push(...(data.users as typeof all));
      if (data.users.length < perPage) break;
      page += 1;
      if (page > 25) break;
    }

    const ids = all.map((u) => u.id);
    const [profilesRes, rolesRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name, email").in("id", ids),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
    ]);
    if (profilesRes.error)
      throw new Error(`profiles query failed: ${profilesRes.error.message}`);
    if (rolesRes.error)
      throw new Error(`user_roles query failed: ${rolesRes.error.message}`);

    const profileMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
    const roleMap = new Map<string, AppRole[]>();
    for (const r of rolesRes.data ?? []) {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role as AppRole);
      roleMap.set(r.user_id, arr);
    }

    const users: ManagedUser[] = all.map((u) => ({
      id: u.id,
      email: u.email ?? profileMap.get(u.id)?.email ?? "",
      display_name:
        profileMap.get(u.id)?.display_name ?? u.user_metadata?.display_name ?? null,
      roles: roleMap.get(u.id) ?? [],
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      banned_until: u.banned_until ?? null,
      invited_at: u.invited_at ?? null,
      email_confirmed_at: u.email_confirmed_at ?? null,
    }));

    users.sort((a, b) => (a.email > b.email ? 1 : -1));
    return { users };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
    const hasKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    const keyLen = process.env.SUPABASE_SERVICE_ROLE_KEY?.length ?? 0;
    // Server-side log keeps the env diagnostics. Client gets a generic message
    // so we don't leak service-role-key presence/length to the browser.
    console.error(
      `[listUsers] failed: ${msg} | env: url=${hasUrl} key=${hasKey} keyLen=${keyLen}`,
    );
    return { users: [], debug: "Failed to list users. See server logs." };
  }
}

const CreateUserSchema = z.object({
  email: z.string().trim().email().max(255),
  display_name: z.string().trim().min(1).max(120),
  role: z.enum(ROLE_VALUES),
  password: z.string().min(8).max(128),
  notes: z.string().max(1000).optional(),
});

/**
 * Create a user account directly (no email invite sent).
 *
 * Designed for the SSO-with-admin-provisioning model: admin pre-creates the
 * account with a temp password and shares it manually. The user can sign in
 * via email/password immediately, and once Microsoft SSO is wired up,
 * signing in with the same email auto-links the OAuth identity to this
 * existing user (Supabase matches by confirmed email). No SMTP required.
 *
 * `email_confirm: true` so the user is "confirmed" from creation — required
 * for the email-match identity-linking flow to work later.
 */
export async function inviteUser(input: z.input<typeof CreateUserSchema>) {
  const data = CreateUserSchema.parse(input);
  const { supabaseAdmin, userId } = await requireAdmin();

  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
    user_metadata: { display_name: data.display_name },
  });
  if (error) throw new Error(error.message);
  const newId = created.user?.id;
  if (!newId) throw new Error("createUser returned no user id");

  await supabaseAdmin
    .from("profiles")
    .upsert(
      { id: newId, email: data.email, display_name: data.display_name },
      { onConflict: "id" },
    );

  const { error: roleErr } = await supabaseAdmin
    .from("user_roles")
    .insert({ user_id: newId, role: data.role });
  if (roleErr && !/duplicate/i.test(roleErr.message)) throw new Error(roleErr.message);

  await logAudit(supabaseAdmin, userId, "user_created", newId, {
    email: data.email,
    role: data.role,
    notes: data.notes ?? null,
  });

  return { id: newId };
}

const UpdateSchema = z.object({
  user_id: z.string().uuid(),
  display_name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(ROLE_VALUES).optional(),
});

export async function updateUser(input: z.input<typeof UpdateSchema>) {
  const data = UpdateSchema.parse(input);
  const { supabaseAdmin, userId } = await requireAdmin();

  if (data.display_name !== undefined) {
    await supabaseAdmin
      .from("profiles")
      .update({ display_name: data.display_name })
      .eq("id", data.user_id);
    await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      user_metadata: { display_name: data.display_name },
    });
  }

  if (data.role !== undefined) {
    const { data: existing } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user_id);
    const before = (existing ?? []).map((r) => r.role);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const { error: insErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role });
    if (insErr) throw new Error(insErr.message);

    await logAudit(supabaseAdmin, userId, "user_role_changed", data.user_id, {
      before,
      after: [data.role],
    });
  }

  return { ok: true as const };
}

const SetActiveSchema = z.object({
  user_id: z.string().uuid(),
  active: z.boolean(),
});

export async function setUserActive(input: z.input<typeof SetActiveSchema>) {
  const data = SetActiveSchema.parse(input);
  const { supabaseAdmin, userId } = await requireAdmin();

  // 'none' clears ban; '876000h' ~ 100y.
  const ban_duration = data.active ? "none" : "876000h";
  const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
    ban_duration,
  } as { ban_duration: string });
  if (error) throw new Error(error.message);

  await logAudit(
    supabaseAdmin,
    userId,
    data.active ? "user_reactivated" : "user_deactivated",
    data.user_id,
    {},
  );

  return { ok: true as const };
}

const ResetSchema = z.object({
  user_id: z.string().uuid(),
  redirect_to: z.string().url().optional(),
});

/**
 * Resolves `redirect_to` against an allowlist of our own origins. Anything
 * else (or a malformed URL) is rejected — Supabase's recovery link embeds the
 * one-time token in this URL, so accepting attacker-supplied hosts lets a
 * compromised/coerced admin exfiltrate the token to an external site.
 */
function assertAllowedRedirect(target: string | undefined): string | undefined {
  if (!target) return undefined;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const allowed = new Set<string>();
  if (siteUrl) {
    try {
      allowed.add(new URL(siteUrl).origin);
    } catch {
      /* ignore malformed env */
    }
  }
  // Allow localhost during development for the admin password-reset flow.
  if (process.env.NODE_ENV !== "production") {
    allowed.add("http://localhost:3000");
  }
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    throw new Error("Invalid redirect_to URL");
  }
  if (!allowed.has(parsed.origin)) {
    throw new Error(
      `redirect_to origin ${parsed.origin} is not allowed. Configure NEXT_PUBLIC_SITE_URL to whitelist it.`,
    );
  }
  return parsed.toString();
}

export async function forcePasswordReset(input: z.input<typeof ResetSchema>) {
  const data = ResetSchema.parse(input);
  const { supabaseAdmin, userId } = await requireAdmin();

  const redirectTo = assertAllowedRedirect(data.redirect_to);

  const { data: u, error: getErr } = await supabaseAdmin.auth.admin.getUserById(
    data.user_id,
  );
  if (getErr || !u.user?.email) throw new Error(getErr?.message ?? "User not found");

  const { error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email: u.user.email,
    options: redirectTo ? { redirectTo } : undefined,
  });
  if (error) throw new Error(error.message);

  await logAudit(supabaseAdmin, userId, "user_password_reset", data.user_id, {});
  return { ok: true as const };
}

const ReassignSchema = z.object({
  from_user: z.string().uuid(),
  to_user: z.string().uuid().nullable(),
});

export async function reassignSubmissions(input: z.input<typeof ReassignSchema>) {
  const data = ReassignSchema.parse(input);
  const { supabaseAdmin, userId } = await requireAdmin();

  const { data: rows, error: rErr } = await supabaseAdmin
    .from("submissions")
    .select("id")
    .eq("assigned_to", data.from_user);
  if (rErr) throw new Error(rErr.message);
  const ids = (rows ?? []).map((r) => r.id);
  if (ids.length === 0) return { count: 0 };

  const { error } = await supabaseAdmin
    .from("submissions")
    .update({
      assigned_to: data.to_user,
      assigned_at: data.to_user ? new Date().toISOString() : null,
      assigned_by: data.to_user ? userId : null,
    })
    .in("id", ids);
  if (error) throw new Error(error.message);

  await logAudit(supabaseAdmin, userId, "submissions_reassigned", null, {
    from_user: data.from_user,
    to_user: data.to_user,
    count: ids.length,
  });
  return { count: ids.length };
}

const CountSchema = z.object({ user_id: z.string().uuid() });

export async function countAssignmentsForUser(input: z.input<typeof CountSchema>) {
  const data = CountSchema.parse(input);
  const { supabaseAdmin } = await requireAdmin();
  const { count, error } = await supabaseAdmin
    .from("submissions")
    .select("*", { count: "exact", head: true })
    .eq("assigned_to", data.user_id);
  if (error) throw new Error(error.message);
  return { count: count ?? 0 };
}

export async function getSystemMetrics() {
  const { supabaseAdmin } = await requireAdmin();
  const [submissions, classifications, themes, responses, decisions, users] =
    await Promise.all([
      supabaseAdmin.from("submissions").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("classifications").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("themes").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("responses").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("decisions").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("user_roles").select("*", { count: "exact", head: true }),
    ]);
  return {
    submissions: submissions.count ?? 0,
    classifications: classifications.count ?? 0,
    themes: themes.count ?? 0,
    responses: responses.count ?? 0,
    decisions: decisions.count ?? 0,
    role_assignments: users.count ?? 0,
  };
}

const REDACTED_FIELDS = new Set([
  "content",
  "submitter_name",
  "submitter_email",
  "submitter_role",
  "draft_text",
  "summary",
  "notes",
  "name",
  "description",
  "feedback_types",
  "principle_tags",
  "roles_affected",
  "divisions",
  "sentiment",
  "themes",
]);

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

function redactDetails(input: unknown): JsonValue {
  if (input == null) return null;
  if (Array.isArray(input)) return input.map(redactDetails);
  if (typeof input === "object") {
    const out: { [k: string]: JsonValue } = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (REDACTED_FIELDS.has(k.toLowerCase())) {
        out[k] = "[redacted]";
      } else {
        out[k] = redactDetails(v);
      }
    }
    return out;
  }
  if (typeof input === "string" || typeof input === "number" || typeof input === "boolean") {
    return input;
  }
  return null;
}

export async function getAdminAuditLog() {
  const { supabaseAdmin } = await requireAdmin();
  const { data, error } = await supabaseAdmin
    .from("audit_log")
    .select("id, user_id, action, entity_type, entity_id, created_at, details")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return {
    entries: (data ?? []).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      created_at: r.created_at,
      details: redactDetails(r.details),
    })),
  };
}
