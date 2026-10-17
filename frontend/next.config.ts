import type { NextConfig } from "next";

const scriptSources = "'self' 'unsafe-eval' 'unsafe-inline'";

const contentSecurityPolicy = (scriptSourceList: string) =>
  [
    "default-src 'self'",
    `script-src ${scriptSourceList}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https: http://localhost:8000 http://127.0.0.1:8000 ws: wss:",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
  ].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy(scriptSources),
          },
        ],
      },
      {
        source: "/",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy(
              `${scriptSources} https://cdn.tailwindcss.com https://code.iconify.design https://cdnjs.cloudflare.com`,
            ),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
