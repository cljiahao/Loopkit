import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Don't advertise the framework (drops the X-Powered-By: Next.js header).
  poweredByHeader: false,

  images: {
    remotePatterns: [
      { protocol: "http", hostname: "127.0.0.1", port: "54321" },
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
    ],
  },

  async redirects() {
    return [{ source: "/register", destination: "/login", permanent: false }];
  },

  async headers() {
    // Frame-blocking headers break IDE/browser preview panes that render the
    // dev server inside an <iframe>. Only enforce them in production, where
    // clickjacking is the actual threat model.
    const isProd = process.env.NODE_ENV === "production";
    const frameHeaders = isProd
      ? [
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
          },
        ]
      : [];

    return [
      {
        source: "/(.*)",
        headers: [
          ...frameHeaders,
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-XSS-Protection", value: "0" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
