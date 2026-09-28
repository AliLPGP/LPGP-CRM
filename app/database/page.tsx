import { getSessionUser } from "@/lib/auth";
import { getDirectoryIndex } from "@/lib/directory/index-server";
import { getRecentCommitments, listDirectoryLists, listSavedSearches } from "@/lib/directory/queries";
import { packIndex } from "@/lib/directory/records";
import { getDirectorySetup, missingSql, upgradeOnly } from "@/lib/directory/setup";
import { worldGeometry } from "@/lib/directory/world-map";
import { lushaConfigured } from "@/lib/lusha";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { Discover } from "@/components/directory/discover";
import { DirectorySetupPanel } from "@/components/directory/directory-setup";
import type { OverviewCommitment } from "@/components/directory/overview";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";
export const metadata = { title: "Discover — LPGP Connect" };

export default async function DatabasePage() {
  const [index, user, lists, saved, setup, recent] = await Promise.all([
    getDirectoryIndex(),
    getSessionUser(),
    listDirectoryLists(),
    listSavedSearches(),
    getDirectorySetup(),
    getRecentCommitments(12),
  ]);
  const isAdmin = user?.role === "admin";
  const parts = isAdmin ? await missingSql(setup) : [];
  const needsSetup = setup.configured && (parts.length > 0 || !setup.lastImport);

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
    <div className="mx-auto max-w-[1440px] space-y-5 px-4 py-6 md:px-6 md:py-8">
      {!isSupabaseConfigured() ? <SetupNotice /> : null}
      {needsSetup && (isAdmin || !index.records.some((r) => r.directory)) ? (
        <DirectorySetupPanel
          state={{
            sqlDone: parts.length === 0 && setup.directory && setup.funds && setup.portfolio,
            fundsOnly: upgradeOnly(setup),
            lastImport: setup.lastImport,
            sqlEditorUrl: setup.sqlEditorUrl,
          }}
          parts={parts}
          isAdmin={isAdmin}
        />
      ) : null}
      <Discover
        packed={packIndex(index)}
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
    </div>
  );
}
