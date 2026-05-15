import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

let cached: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createClient() {
  if (!cached) {
    cached = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return cached;
}

// Convenience proxy so existing code that imports `supabase` and calls
// `supabase.from(...)` etc. continues to work. Browser-only — server
// code should use `createClient` from ./server instead.
export const supabase = new Proxy(
  {} as ReturnType<typeof createBrowserClient<Database>>,
  {
    get(_target, prop, receiver) {
      return Reflect.get(createClient(), prop, receiver);
    },
  },
);
