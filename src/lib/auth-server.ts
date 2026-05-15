import "server-only";
import { createClient } from "@/integrations/supabase/server";
import { createAdminClient } from "@/integrations/supabase/admin";

/**
 * Resolve the current authenticated user from the request cookie. Throws if
 * no valid session is present. Returns the user-scoped (RLS-respecting)
 * supabase client and the user id.
 */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error("Unauthorized");
  }
  return { supabase, user, userId: user.id };
}

/**
 * Like requireUser, but also asserts the user has the admin role and returns
 * the service-role supabase client. Use for privileged admin operations.
 */
export async function requireAdmin() {
  const { supabase, userId } = await requireUser();

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");

  return { supabase, supabaseAdmin: createAdminClient(), userId };
}
