import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

if (process.env.NODE_ENV !== "production") {
  initOpenNextCloudflareForDev();
}

const nextConfig: NextConfig = {
  // OpenNext must externalize + patch the Prisma client for the workerd
  // runtime; without this the client does fs scans (e.g. fs.readdir) that
  // Cloudflare Workers don't implement. See opennext.js.org/cloudflare/howtos/db
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;
