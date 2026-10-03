import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The directory setup panel reads the SQL it asks an admin to paste.
  outputFileTracingIncludes: {
    "/database": ["./supabase/sql-parts/3-directory/*.sql", "./supabase/sql-parts/4-intelligence/*.sql", "./supabase/migrations/001[45]_*.sql"],
    "/import/directory": ["./supabase/sql-parts/3-directory/*.sql", "./supabase/sql-parts/4-intelligence/*.sql", "./supabase/migrations/001[45]_*.sql", "./data/intelligence/*.json"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "logo.clearbit.com" },
      { protocol: "https", hostname: "**.lusha.com" },
    ],
  },
  experimental: {
    // Client router cache: reuse a just-visited dynamic page for three
    // minutes instead of refetching, so going back and forth between desks is
    // instant. A write still refreshes at once: server actions revalidate the
    // paths they touch, which clears these entries.
    staleTimes: {
      dynamic: 180,
      static: 600,
    },
  },
};

export default nextConfig;
