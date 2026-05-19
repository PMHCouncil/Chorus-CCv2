import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/integrations/supabase/server";
import { createAdminClient } from "@/integrations/supabase/admin";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const oauthError =
    url.searchParams.get("error_description") || url.searchParams.get("error");

  // Open-redirect guard: only same-origin paths.
  const nextParam = url.searchParams.get("next") || "/app";
  const safeNext =
    nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/app";

  console.error("[auth/callback] received", {
    origin: url.origin,
    next: nextParam,
    hasCode: Boolean(code),
    oauthError: oauthError ?? null,
  });

  if (oauthError) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("error", oauthError);
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const supabase = await createClient();
  const { data: exchanged, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !exchanged.user) {
    console.error("[auth/callback] exchangeCodeForSession failed", {
      origin: url.origin,
      next: nextParam,
      message: error?.message ?? null,
      status: (error as { status?: number } | null)?.status ?? null,
      name: error?.name ?? null,
    });
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("error", error?.message ?? "Sign-in failed");
    return NextResponse.redirect(loginUrl);
  }

  // Enforce pre-provisioned access. Pre-created Chorus users always have a
  // user_roles row (see inviteUser); a missing row means Supabase auto-created
  // this auth.users record from the OAuth flow — i.e. the email is unknown.
  const userId = exchanged.user.id;
  const userEmail = exchanged.user.email ?? "this account";
  const admin = createAdminClient();
  const { data: roles, error: rolesError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .limit(1);

  if (rolesError) {
    await supabase.auth.signOut();
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set(
      "error",
      `Failed to verify access: ${rolesError.message}`,
    );
    return NextResponse.redirect(loginUrl);
  }

  if (!roles || roles.length === 0) {
    // Orphan auth user from a non-provisioned email. Sign out + delete so
    // the auth.users table doesn't accumulate rejected sign-in attempts.
    await supabase.auth.signOut();
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      console.error(
        "[auth/callback] failed to delete orphan user",
        userId,
        delErr.message,
      );
    }
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set(
      "error",
      `${userEmail} is not authorized for Chorus. Contact your administrator.`,
    );
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(new URL(safeNext, url.origin));
}
