import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The website message box may be framed by the two public sites only.
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://staffanchor.com https://www.staffanchor.com https://jobs.staffanchor.com http://localhost:3000 http://localhost:3111",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
