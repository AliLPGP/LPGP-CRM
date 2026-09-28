import Link from "next/link";
import { ListChecks, Map as MapIcon, Upload } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getDirectoryIndex } from "@/lib/directory/index-server";
import { listDirectoryLists, listSavedSearches } from "@/lib/directory/queries";
import { packIndex } from "@/lib/directory/records";
import { lushaConfigured } from "@/lib/lusha";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { Discover } from "@/components/directory/discover";
import { PageHeader } from "@/components/page-header";
import { SetupNotice } from "@/components/setup-notice";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Discover — LPGP Connect" };

export default async function DatabasePage() {
  const [index, user, lists, saved] = await Promise.all([
    getDirectoryIndex(),
    getSessionUser(),
    listDirectoryLists(),
    listSavedSearches(),
  ]);
  const firms = index.records.length;
  const managers = index.records.filter((r) => r.providers.length).length;

  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-6 py-8 space-y-6">
      <PageHeader
        eyebrow="Intelligence database"
        title="Discover"
        description={
          firms
            ? `Search ${firms.toLocaleString("en-US")} LPs, GPs and providers by thesis, filters or lookalikes — with Form ADV service-provider links for ${managers.toLocaleString("en-US")} managers.`
            : "Search LPs, GPs and providers by thesis, filters or lookalikes."
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/database/market">
                <MapIcon className="h-4 w-4" /> Market map
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/database/lists">
                <ListChecks className="h-4 w-4" /> Lists
              </Link>
            </Button>
            {user?.role === "admin" ? (
              <Button asChild variant="outline">
                <Link href="/import/directory">
                  <Upload className="h-4 w-4" /> Import
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      {!isSupabaseConfigured() ? <SetupNotice /> : null}
      <Discover
        packed={packIndex(index)}
        lists={lists.map((l) => ({ id: l.id, name: l.name, item_count: l.item_count }))}
        saved={saved}
        userId={user?.id ?? null}
        isAdmin={user?.role === "admin"}
        lushaReady={lushaConfigured()}
        adminReady={isAdminConfigured()}
        aiReady={Boolean(process.env.ANTHROPIC_API_KEY)}
      />
    </div>
  );
}
