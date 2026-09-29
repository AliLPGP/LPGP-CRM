import Link from "next/link";
import { ASSET_CLASSES, isAssetClassKey, SIGNAL_KIND_LABEL, type AssetClassKey } from "@/lib/directory/asset-classes";
import { getSignals } from "@/lib/directory/intelligence-queries";
import { getRecentFilings } from "@/lib/directory/queries";
import { getSessionUser } from "@/lib/auth";
import { IntelShell } from "@/components/intel/shell";
import { SignalRefreshButton } from "@/components/intel/signal-refresh";
import { SignalList } from "@/components/intel/tables";
import { Box, Empty, SubTabs } from "@/components/intel/ui";
import { CompanyLogo } from "@/components/company-logo";
import { dateLabel } from "@/components/intel/tables";

export const dynamic = "force-dynamic";
export const metadata = { title: "Signals — LPGP Connect" };

export default async function SignalsPage({ searchParams }: { searchParams: Promise<{ class?: string; kind?: string }> }) {
  const { class: clsParam, kind } = await searchParams;
  const cls = isAssetClassKey(clsParam) ? (clsParam as AssetClassKey) : null;
  const [signals, filings, user] = await Promise.all([
    getSignals({ assetClass: cls, kind: kind && kind in SIGNAL_KIND_LABEL ? kind : null, limit: 400 }),
    getRecentFilings(15),
    getSessionUser(),
  ]);
  const href = (c: AssetClassKey | null, k?: string | null) => {
    const sp = new URLSearchParams();
    if (c) sp.set("class", c);
    if (k) sp.set("kind", k);
    const qs = sp.toString();
    return `/database/signals${qs ? `?${qs}` : ""}`;
  };

  return (
    <IntelShell
      crumbs={[{ label: "Signals" }]}
      title="Signals"
      description="Dated market news per asset class — fund closes, deals, regulation, people moves, performance releases — each with its source, plus what your own data shows moving."
      actions={user?.role === "admin" ? <SignalRefreshButton /> : null}
      tabs={
        <SubTabs
          items={[
            { href: href(null, kind), label: "All classes", active: !cls },
            ...ASSET_CLASSES.map((c) => ({ href: href(c.key, kind), label: c.short, active: cls === c.key })),
          ]}
        />
      }
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Box
          title="Market signals"
          count={signals.length}
          flush
          action={
            <div className="flex flex-wrap gap-1">
              <Link href={href(cls, null)} className={`tag ${!kind ? "tag-strong" : ""}`}>
                All kinds
              </Link>
              {Object.entries(SIGNAL_KIND_LABEL).map(([k, label]) => (
                <Link key={k} href={href(cls, k)} className={`tag ${kind === k ? "tag-strong" : ""}`}>
                  {label}
                </Link>
              ))}
            </div>
          }
        >
          <SignalList signals={signals} showClass={!cls} />
        </Box>
        <div className="space-y-4">
          <Box title="Latest Form ADV filings" count={filings.length} flush defn="Managers in the directory by the date of their most recent Form ADV filing — a fresh filing means new fund, provider and AUM data.">
            {filings.length ? (
              <ul className="divide-y">
                {filings.map((f) => (
                  <li key={f.id} className="flex items-center gap-2.5 px-3 py-2 text-[12px]">
                    <CompanyLogo name={f.name} domain={f.domain} size={20} />
                    <Link href={`/companies/${f.id}`} className="min-w-0 flex-1 truncate font-medium">
                      {f.name}
                    </Link>
                    <span className="text-muted-foreground">{f.sub_type ?? ""}</span>
                    <span className="figure text-[11px] text-muted-foreground">{dateLabel(f.adv_last_filed)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No Form ADV dates on file yet.</Empty>
            )}
          </Box>
          <Box title="How signals work">
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Each signal is a dated news item found by web search, kept with the URL of the page that reported it and the firms it names.
              The shipped dataset seeds the feed; with <code className="font-mono text-[11px]">ANTHROPIC_API_KEY</code> set, a daily job
              reads the last few days of news for every asset class and adds what is new. Nothing is written without a source.
            </p>
          </Box>
        </div>
      </div>
    </IntelShell>
  );
}
