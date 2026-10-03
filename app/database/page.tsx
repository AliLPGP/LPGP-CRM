import { preload } from "react-dom";
import { getSessionUser } from "@/lib/auth";
import { getDirectoryOverview } from "@/lib/directory/index-server";
import { getRecentCommitments, listDirectoryLists, listSavedSearches } from "@/lib/directory/queries";
import { indexUrl } from "@/lib/directory/records";
import { getDirectorySetup, missingSql, sqlDone, upgradeOnly } from "@/lib/directory/setup";
import { worldGeometry } from "@/lib/directory/world-map";
import { lushaConfigured } from "@/lib/lusha";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { Discover } from "@/components/directory/discover";
import { DirectorySetupPanel } from "@/components/directory/directory-setup";
import type { OverviewCommitment } from "@/components/directory/overview";
import { SetupNotice } from "@/components/setup-notice";
import { IntelShell } from "@/components/intel/shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Discover — LPGP Intelligence" };

// The page ships without the index: the stand's figures come from the cached
// overview, and the browser fetches the packed index from /api/directory/index
// (preloaded from the head, so the request is in flight before hydration).

export default async function DatabasePage() {
  const [overview, user, lists, saved, setup, recent] = await Promise.all([
    getDirectoryOverview(),
    getSessionUser(),
    listDirectoryLists(),
    listSavedSearches(),
    getDirectorySetup(),
    getRecentCommitments(12),
  ]);
  const isAdmin = user?.role === "admin";
  const parts = isAdmin ? await missingSql(setup) : [];
  const needsSetup = setup.configured && (parts.length > 0 || !setup.lastImport || !setup.datasetLoaded);

  preload(indexUrl(overview.version), { as: "fetch", crossOrigin: "anonymous" });

  let geometry = null;
  try {
    geometry = worldGeometry();
  } catch {
    // The map is decoration on top of the numbers; the page stands without it.
  }

  const commitments: OverviewCommitment[] = recent.map((c) => ({
    id: c.id,
    lp: c.lp_label ? { id: c.lp_company_id, name: c.lp_label } : null,
    gp: c.gp_label ? { id: c.gp_company_id, name: c.gp_label } : null,
    fund: c.fund_label,
    fundId: c.fund_id,
    amount: c.amount,
    currency: c.currency,
    amountText: c.amount_text,
    when: c.commitment_date_text ?? (c.commitment_year ? String(c.commitment_year) : null),
    kind: c.disclosure_type,
    sourceUrl: c.source_url,
  }));

  return (
    <IntelShell>
      {!isSupabaseConfigured() ? <SetupNotice /> : null}
      {needsSetup && (isAdmin || !overview.hasDirectoryFirms) ? (
        <DirectorySetupPanel
          state={{
            sqlDone: parts.length === 0 && sqlDone(setup),
            fundsOnly: upgradeOnly(setup),
            datasetLoaded: setup.datasetLoaded,
            lastImport: setup.lastImport,
            sqlEditorUrl: setup.sqlEditorUrl,
          }}
          parts={parts}
          isAdmin={isAdmin}
        />
      ) : null}
      <Discover
        overview={overview}
        lists={lists.map((l) => ({ id: l.id, name: l.name, item_count: l.item_count }))}
        saved={saved}
        userId={user?.id ?? null}
        isAdmin={isAdmin}
        lushaReady={lushaConfigured()}
        adminReady={isAdminConfigured()}
        aiReady={Boolean(process.env.ANTHROPIC_API_KEY)}
        geometry={geometry}
        commitments={commitments}
      />
    </IntelShell>
  );
}
