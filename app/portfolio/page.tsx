import Link from "next/link";
import { Star, Download } from "lucide-react";
import { listPortfolioCompanies } from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { CompaniesBrowser } from "@/components/companies-browser";
import { SetupNotice } from "@/components/setup-notice";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Portfolio — LPGP Intelligence" };
export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const companies = await listPortfolioCompanies();

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-8 space-y-6">
      <PageHeader
        eyebrow="Watchlist"
        title="Portfolio"
        description="The firms you're actively tracking — added with Add to Portfolio on any company."
        actions={
          companies.length > 0 ? (
            <Button asChild variant="outline">
              <a href="/api/export/companies?portfolio=1" download>
                <Download className="h-4 w-4" /> Export CSV
              </a>
            </Button>
          ) : null
        }
      />

      {!isSupabaseConfigured() ? <SetupNotice /> : null}

      {companies.length === 0 ? (
        <EmptyState
          icon={<Star className="h-6 w-6" />}
          title="No firms in your portfolio yet"
          description="Open any company profile and click “Add to Portfolio” to pin it here for quick access and reporting."
          action={
            <Button asChild>
              <Link href="/companies">Browse companies</Link>
            </Button>
          }
        />
      ) : (
        <CompaniesBrowser companies={companies} />
      )}
    </div>
  );
}
