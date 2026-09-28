import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The directory setup panel reads the SQL it asks an admin to paste.
  outputFileTracingIncludes: {
    "/database": ["./supabase/sql-parts/3-directory/*.sql", "./supabase/migrations/0014_fund_lineup.sql", "./supabase/migrations/0015_portfolio_companies.sql"],
    "/import/directory": ["./supabase/sql-parts/3-directory/*.sql", "./supabase/migrations/0014_fund_lineup.sql", "./supabase/migrations/0015_portfolio_companies.sql"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "logo.clearbit.com" },
      { protocol: "https", hostname: "**.lusha.com" },
    ],
  },
  experimental: {
    // Client router cache: reuse a just-visited dynamic page for 30s instead
    // of refetching — makes hopping between Pipeline/Leads/Database instant.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
