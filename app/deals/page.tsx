import { Radar } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getMyDeals } from "@/lib/my-deals";
import { isOpsConfigured, isOpsWriteEnabled, opsPanelUrl } from "@/lib/ops";
import { formatOpsMoney } from "@/lib/ops-types";
import { MyDealsTable } from "@/components/deals/my-deals-table";
import { RecordDealDialog } from "@/components/ops/record-deal-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatCard, StatRow } from "@/components/stat-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "My deals — LPGP Intelligence" };

export default async function MyDealsPage() {
  const user = await getSessionUser();
  const { deals, initials, needInvoice, awaitingSignature, totals, error } = user
    ? await getMyDeals(user.id)
    : {
        deals: [],
        initials: null,
        needInvoice: 0,
        awaitingSignature: 0,
        totals: [],
        error: null as string | null,
      };

  return (
    <div className="mx-auto max-w-[95rem] space-y-6 px-4 py-8 md:px-6">
      <PageHeader
        eyebrow="Sales CRM"
        title="My deals"
        description="Your deals as the ops panel holds them — nothing is copied here. Adding one checks the tracker first, so the same business never gets entered twice."
        actions={isOpsWriteEnabled() ? <RecordDealDialog /> : null}
      />

      {!isOpsConfigured() || error ? (
        <EmptyState
          icon={<Radar />}
          title="Not reading the ops panel"
          description={error ?? "Your deals live in the ops panel; connect it in Settings and they appear here."}
        />
      ) : (
        <>
          {/* One contracted card per currency: GBP and USD are never added into one figure. */}
          <StatRow>
            <StatCard
              label="My deals"
              value={deals.length}
              basis={initials ? `Stamped ${initials} in the tracker, plus any you added` : "Set your initials in Admin → Team to pick these up"}
            />
            {totals.length ? (
              totals.map((t) => (
                <StatCard
                  key={t.currency}
                  label={`Contracted (${t.currency})`}
                  value={formatOpsMoney(t.contracted, t.currency)}
                  basis={`${formatOpsMoney(t.paid, t.currency)} received, ${t.currency} deals only`}
                />
              ))
            ) : (
              <StatCard label="Contracted" value="—" basis="No deals on file yet" />
            )}
            <StatCard label="Need an invoice" value={needInvoice} basis={needInvoice ? "No agreement on file — the admin has to send one" : "Every deal has its agreement filed"} />
            <StatCard label="Awaiting signature" value={awaitingSignature} basis={awaitingSignature ? "Sent, waiting on the signed copy" : "Nothing outstanding"} />
          </StatRow>

          <MyDealsTable deals={deals} opsPanelUrl={opsPanelUrl()} />
        </>
      )}
    </div>
  );
}
