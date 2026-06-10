import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Workspace packages are TS source — let Next.js transpile them.
  transpilePackages: ["@enjab/automations", "@enjab/db", "@enjab/hms-client", "@enjab/wa-client"],
  // Trust the X-Forwarded-* headers from nginx.
  experimental: { serverActions: { allowedOrigins: ["automations.enjab.ae"] } },
};

export default config;
