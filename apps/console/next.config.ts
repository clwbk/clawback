import type { NextConfig } from "next";

import { buildConsoleSecurityHeaders } from "./app/lib/security-headers";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildConsoleSecurityHeaders(process.env.NODE_ENV ?? "development"),
      },
    ];
  },
};

export default nextConfig;
