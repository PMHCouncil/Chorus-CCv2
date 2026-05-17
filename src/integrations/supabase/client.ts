import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

type BrowserClient = ReturnType<typeof createBrowserClient<Database>>;

let cached: BrowserClient | undefined;

// During `next build` page-data collection, every client component module
// is evaluated server-side. If we eagerly call createBrowserClient at
// import time (or even in a top-level useMemo) it throws when
// NEXT_PUBLIC_SUPABASE_* aren't set — which is the case for any build
// that runs without a populated .env. In Amplify those vars ARE set at
// build time, so production is unaffected; this guard just makes builds
// in env-less local checkouts succeed and pushes the failure to the
// point where the client is actually used.
export function createClient(): BrowserClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // Return a stub that throws on first real use rather than at
    // construction. Safe during SSR/prerender of "use client" modules.
    return new Proxy({} as BrowserClient, {
      get() {
        throw new Error(
          "Supabase client used before NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY were set",
        );
      },
    });
  }
  cached = createBrowserClient<Database>(url, key);
  return cached;
}

// Convenience proxy so existing code that imports `supabase` and calls
// `supabase.from(...)` etc. continues to work. Browser-only — server
// code should use `createClient` from ./server instead.
export const supabase = new Proxy({} as BrowserClient, {
  get(_target, prop, receiver) {
    return Reflect.get(createClient(), prop, receiver);
  },
});
