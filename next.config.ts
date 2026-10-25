import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // One metadata worker avoids concurrent legacy schema upgrades on the disposable build DB.
  ...(process.env.DMD_ISOLATED_BUILD==="1"?{experimental:{cpus:1}}:{}),
};
export default nextConfig;
