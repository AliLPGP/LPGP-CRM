import Link from "next/link";
import { ASSET_CLASSES, isAssetClassKey, SIGNAL_KIND_LABEL, type AssetClassKey } from "@/lib/directory/asset-classes";
import { getSignals } from "@/lib/directory/intelligence-queries";
import { getRecentFilings } from "@/lib/directory/queries";
import { getSessionUser } from "@/lib/auth";
import { IntelShell } from "@/components/intel/shell";
import { SignalRefreshButton } from "@/components/intel/signal-refresh";
import { dateLabel, ShowMore, SignalList } from "@/components/intel/tables";
import { Box, Empty, Stat, StatStrip, SubTabs } from "@/components/intel/ui";
import { UrlFacets } from "@/components/intel/url-facets";
import { CompanyLogo } from "@/components/company-logo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Signals — LPGP Intelligence" };

// Dated market news per asset class, each item with its page. The class is
// a tab (the header's sections key off it); the kind is a facet. The URL is
// the state; the kind is cut here so its menu can count every kind at once.

const STEP = 100;

export default async function SignalsPage({ searchParams }: { searchParams: Promise<{ class?: string; kind?: string; n?: string }> }) {
  const { class: clsParam, kind: kindParam, n } = await searchParams;
  const cls = isAssetClassKey(clsParam) ? (clsParam as AssetClassKey) : null;
  const kind = kindParam && kindParam in SIGNAL_KIND_LABEL ? kindParam : null;
  const limit = Math.min(2000, Math.max(STEP, Math.floor(Number(n)) || STEP));
  const [all, filings, user] = await Promise.all([getSignals({ assetClass: cls, limit: 400 }), getRecentFilings(15), getSessionUser()]);
  const signals = kind ? all.filter((s) => s.kind === kind) : all;
  const kindCounts = new Map<string, number>();
  for (const s of all) kindCounts.set(s.kind, (kindCounts.get(s.kind) ?? 0) + 1);
  const firms = new Set(all.flatMap((s) => s.firms.map((f) => f.id))).size;
  const sourced = all.filter((s) => s.source_url).length;
  const newest = all.map((s) => s.date).filter(Boolean).sort().at(-1) ?? null;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const recent = all.filter((s) => (s.date ?? "").startsWith(thisMonth)).length;
  const href = (c: AssetClassKey | null) => {
    const sp = new URLSearchParams();
    if (c) sp.set("class", c);
    if (kind) sp.set("kind", kind);
    const qs = sp.toString();
    return `/database/signals${qs ? `?${qs}` : ""}`;
  };
  const more = (() => {
    const sp = new URLSearchParams();
    if (cls) sp.set("class", cls);
    if (kind) sp.set("kind", kind);
    sp.set("n", String(limit + STEP));
    return `/database/signals?${sp.toString()}`;
  })();

  return (
    <IntelShell
      crumbs={[{ label: "Signals" }]}
      title="Signals"
      description="Dated market news per asset class — fund closes, deals, regulation, people moves, performance releases — each with its source, plus what your own data shows moving."
      tabs={
        <SubTabs
          items={[
            { href: href(null), label: "All classes", active: !cls },
            ...ASSET_CLASSES.map((c) => ({ href: href(c.key), label: c.short, active: cls === c.key })),
          ]}
        />
      }
    >
      <StatStrip>
        <Stat label="Signals" value={all.length.toLocaleString("en-US")} basis={cls ? "in this class, newest 400" : "across every class, newest 400"} />
        <Stat label="This month" value={recent.toLocaleString("en-US")} basis="dated in the current month" />
        <Stat label="Kinds" value={kindCounts.size.toLocaleString("en-US")} basis="deal, fund close, people, regulatory…" />
        <Stat label="Firms named" value={firms.toLocaleString("en-US")} basis="directory firms a signal names" />
        <Stat label="With a page" value={sourced.toLocaleString("en-US")} basis="of these signals carry their source URL" />
        <Stat label="Newest" value={newest ? dateLabel(newest) : "—"} basis="the latest dated item on file" />
      </StatStrip>

      <UrlFacets
        facets={[
          {
            param: "kind",
            label: "Kind",
            searchable: false,
            width: 220,
            groups: [{ label: "", options: Object.entries(SIGNAL_KIND_LABEL).filter(([k]) => kindCounts.has(k) || k === kind).map(([k, label]) => ({ key: k, label, count: kindCounts.get(k) ?? 0 })) }],
          },
        ]}
        count={{ value: signals.length, noun: "signals", of: all.length }}
        right={user?.role === "admin" ? <SignalRefreshButton /> : null}
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Box title="Market signals" count={signals.length} flush>
            {signals.length ? (
              <>
                <SignalList signals={signals} showClass={!cls} limit={limit} />
                <ShowMore href={more} step={STEP} left={signals.length - Math.min(limit, signals.length)} />
              </>
            ) : kind || cls ? (
              <Empty>
                No {kind ? SIGNAL_KIND_LABEL[kind].toLowerCase() : ""} signal in this cut yet.{" "}
                <Link href="/database/signals" className="underline underline-offset-2 hover:text-foreground">
                  See every class and kind
                </Link>
                .
              </Empty>
            ) : (
              <Empty>No signals on file yet. The daily refresh adds dated news per asset class once ANTHROPIC_API_KEY is set{user?.role === "admin" ? "; “Refresh” above runs it now" : ""}.</Empty>
            )}
          </Box>
          <div className="space-y-4">
            <Box title="Latest Form ADV filings" count={filings.length} flush defn="Managers in the directory by the date of their most recent Form ADV filing — a fresh filing means new fund, provider and AUM data.">
              {filings.length ? (
                <ul className="divide-y">
                  {filings.map((f) => (
                    <li key={f.id}>
                      <Link href={`/companies/${f.id}`} className="flex items-center gap-2.5 px-3 py-2 text-[12px] hover:bg-accent/40">
                        <CompanyLogo name={f.name} domain={f.domain} size={20} />
                        <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                        <span className="hidden truncate text-muted-foreground sm:inline">{f.sub_type ?? ""}</span>
                        <span className="figure text-[11px] text-muted-foreground">{dateLabel(f.adv_last_filed)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>No Form ADV dates on file yet. They arrive with the Master Directory import.</Empty>
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
      </UrlFacets>
    </IntelShell>
  );
}
