import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The website message box may be framed by staffanchor.com, and by Vercel preview builds of it (so a change can be reviewed before it is published). The box shows nothing private.
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://staffanchor.com https://www.staffanchor.com https://*.vercel.app http://localhost:3000 http://localhost:3111",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
