import type { NextConfig } from "next";

// Content-Security-Policy. Supabase needs https connect-src to the project
// REST/Realtime endpoint; Anthropic is only called server-side so it doesn't
// appear here. Next.js inline styles and the React runtime need 'unsafe-inline'
// for styles; we omit 'unsafe-inline'/'unsafe-eval' from script-src to keep
// XSS surface tight. Tighten further with nonces if a future refactor adds
// inline <script> blocks.
const supabaseOrigin = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
      : "https://*.supabase.co";
  } catch {
    return "https://*.supabase.co";
  }
})();

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} wss://*.supabase.co`,
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
