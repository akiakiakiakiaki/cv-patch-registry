import { readFileSync } from "node:fs";

const uploadSecurityHeaders = JSON.parse(
  readFileSync(new URL("./src/lib/storage/upload-security-headers.json", import.meta.url), "utf8"),
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // PGlite ships optional Node-only code paths (socket server). Keep it external so the bundler does not resolve them.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  async headers() {
    return [{ source: "/assets/uploads/:path*", headers: uploadSecurityHeaders }];
  },
};

export default nextConfig;
