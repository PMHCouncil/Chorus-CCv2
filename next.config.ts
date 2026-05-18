import type { NextConfig } from "next";

// Content-Security-Policy. Next.js emits inline <script> blocks for runtime
// hydration / route announcements and uses eval() during `next dev` for HMR,
// so script-src needs 'unsafe-inline' and (in dev) 'unsafe-eval'. Even with
// those relaxations the CSP still constrains: frame-ancestors blocks
// clickjacking, base-uri / form-action / object-src tighten common XSS
// pivots, and connect-src whitelists Supabase only. A follow-up pass can
// move to nonce-based script-src to drop 'unsafe-inline'.
const supabaseOrigin = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
      : "https://*.supabase.co";
  } catch {
    return "https://*.supabase.co";
  }
})();

const isDev = process.env.NODE_ENV !== "production";
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} wss://*.supabase.co https://api.anthropic.com`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Pin file-tracing to this project so a parent-directory lockfile
  // (e.g. C:\Users\<user>\package-lock.json on dev machines) doesn't
  // get auto-detected as the workspace root.
  outputFileTracingRoot: process.cwd(),

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  // Stop the dev file watcher from reloading on every change to
  // playwright-cli scratch files. We replace `watchOptions.ignored` with a
  // single regex that covers the standard noisy directories plus our
  // playwright artefacts.
  webpack: (config) => {
    config.watchOptions = {
      ...(config.watchOptions ?? {}),
      ignored:
        /[\\/](?:\.git|node_modules|\.next|\.playwright-cli|\.vercel)[\\/]/,
    };
    return config;
  },
};

export default nextConfig;
