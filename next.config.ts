import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin file-tracing to this project so a parent-directory lockfile
  // (e.g. C:\Users\<user>\package-lock.json on dev machines) doesn't
  // get auto-detected as the workspace root.
  outputFileTracingRoot: process.cwd(),

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
