import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // Talent board and Practice Pool were folded into the Talent Inventory and the role matches on each mandate.
    return [
      { source: "/candidates/board", destination: "/candidates/inventory", permanent: false },
      { source: "/practice-pool", destination: "/candidates/inventory", permanent: false },
    ];
  },
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
