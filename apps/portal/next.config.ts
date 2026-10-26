import type { NextConfig } from "next";

// Locally the secrets live in the repo-root .env (shared with the bot and
// scripts); on Vercel they come from the project settings instead.
try {
  process.loadEnvFile("../../.env");
} catch {
  // no root .env — fine on Vercel
}

const config: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: [
    "@tallocpa/db",
    "@tallocpa/domain",
    "@tallocpa/photo-parser",
    "@tallocpa/validation",
  ],
  // The packages import siblings as "./x.js" (TS bundler style); point those at the .ts
  // source. Turbopack can't do this yet, hence `--webpack` in package.json.
  webpack: (cfg) => {
    cfg.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return cfg;
  },
  // Only the public URL + publishable key reach the browser; never the service role.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
  },
};

export default config;
