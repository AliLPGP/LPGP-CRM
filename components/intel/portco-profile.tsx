import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { Empty, Src } from "@/components/intel/ui";
import { formatMoney } from "@/lib/directory/intelligence-types";
import { confirmedLeader, sourceTier, type PortcoIntel } from "@/lib/directory/portco-intel";
import type { PortfolioCompany } from "@/lib/directory/portfolio";

// A portfolio company's profile as the desk's sheet lays it out, each value
// with the page it came from and how far that page can be trusted. Revenue,
// EBITDA, employees and the named executives only ever appear from primary
// sources (filings, the company, the sponsor, their releases) or major
// press; the database refuses the rest on the way in.

const TIER_LABEL = { primary: "primary source", press: "major press", secondary: "secondary" } as const;

type Source = { url?: string; name?: string; kind?: string; as_of?: string | null; evidence?: string | null };

function SourceMark({ src }: { src: Source | undefined }) {
  if (!src?.url) return null;
  const tier = sourceTier(src.kind);
  return (
    <span className="ml-1.5 inline-flex items-center gap-1 align-middle" title={src.evidence ? `“${src.evidence}”` : undefined}>
      {tier !== "secondary" ? <BadgeCheck className="h-3 w-3 text-muted-foreground" aria-label={TIER_LABEL[tier]} /> : null}
      <Src url={src.url} name={src.name ?? TIER_LABEL[tier]} asOf={src.as_of ?? undefined} />
    </span>
  );
}

const first = (intel: PortcoIntel, field: string): Source | undefined => intel.sources?.[field]?.[0];

export function ProfileFacts({ intel, holdings }: { intel: PortcoIntel | null; holdings: (PortfolioCompany & { gp_name: string | null })[] }) {
  const rows: { k: string; v: React.ReactNode; src?: Source }[] = [];
  if (intel) {
    if (intel.business_model) rows.push({ k: "Business model", v: intel.business_model, src: first(intel, "business_model") });
    if (intel.sector || intel.subsector) rows.push({ k: "Sector", v: [intel.sector, intel.subsector].filter(Boolean).join(" · "), src: first(intel, "sector") });
    if (intel.country) rows.push({ k: "Country", v: intel.country });
    if (intel.founded_year) rows.push({ k: "Founded", v: String(intel.founded_year), src: first(intel, "founded_year") });
    if (intel.website)
      rows.push({
        k: "Website",
        v: (
          <a href={intel.website} target="_blank" rel="noreferrer" className="hover:underline">
            {intel.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
          </a>
        ),
      });
    if (intel.email) rows.push({ k: "Email", v: <span className="select-all">{intel.email}{intel.email_type ? <span className="text-muted-foreground"> · {intel.email_type.replace("_", " ")}</span> : null}</span>, src: first(intel, "email") });
    if (intel.employees != null || intel.employees_text)
      rows.push({
        k: "Employees",
        v: (
          <span>
            <span className="figure">{intel.employees_text ?? intel.employees?.toLocaleString("en-US")}</span>
            {intel.employees_as_of ? <span className="text-muted-foreground"> · as of {intel.employees_as_of.slice(0, 10)}</span> : intel.accounts_period_end && intel.employees != null ? <span className="text-muted-foreground"> · accounts to {intel.accounts_period_end}</span> : null}
          </span>
        ),
        src: first(intel, "employees"),
      });
    if (intel.revenue_stated != null)
      rows.push({ k: "Revenue", v: <span><span className="figure">{formatMoney(intel.revenue_stated, intel.revenue_currency)}</span>{intel.revenue_period ? <span className="text-muted-foreground"> · {intel.revenue_period}</span> : null}</span>, src: first(intel, "revenue") });
    if (intel.ebitda_stated != null)
      rows.push({ k: "EBITDA", v: <span><span className="figure">{formatMoney(intel.ebitda_stated, intel.ebitda_currency)}</span><span className="text-muted-foreground">{[intel.ebitda_period, intel.ebitda_basis].filter(Boolean).map((x) => ` · ${x}`).join("")}</span></span>, src: first(intel, "ebitda") });
    for (const role of ["ceo", "cfo", "coo", "managing_director"] as const) {
      const l = confirmedLeader(intel, role);
      if (l) rows.push({ k: role === "managing_director" ? "Managing Director" : role.toUpperCase(), v: <span><span className="font-medium">{l.name}</span>{l.title && l.title.toUpperCase() !== role.toUpperCase() ? <span className="text-muted-foreground"> · {l.title}</span> : null}</span>, src: { url: l.source_url ?? undefined, kind: (intel.leaders ?? []).find((x) => x.name === l.name)?.source_kind ?? "company" } });
    }
  }
  const unconfirmed = (intel?.leaders ?? []).filter((l) => !l.confirmed);
  const plans = holdings.filter((h) => h.value_creation_plan || h.status_note || h.deal_type || h.asset_class);
  if (!rows.length && !plans.length) return <Empty>No profile on file yet. The profile research fills it from the company&rsquo;s own site, filings and the sponsor&rsquo;s releases.</Empty>;
  return (
    <div>
      {rows.length ? (
        <dl className="kv px-3 py-1 text-[12.5px]">
          {rows.map((r) => (
            <div key={r.k} className="contents">
              <dt>{r.k}</dt>
              <dd>
                {r.v}
                <SourceMark src={r.src} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {plans.length ? (
        <ul className="divide-y border-t">
          {plans.map((h) => (
            <li key={h.id} className="px-3 py-2 text-[12px]">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <Link href={`/companies/${h.gp_company_id}?tab=portfolio`} className="font-medium hover:underline">
                  {h.gp_name ?? "Sponsor"}
                </Link>
                {[h.asset_class, h.deal_type, h.status_note].filter(Boolean).map((x) => (
                  <span key={String(x)} className="text-muted-foreground">· {x}</span>
                ))}
              </div>
              {h.value_creation_plan ? (
                <p className="mt-1 leading-snug">
                  <span className="desk-label mr-1.5">Value creation plan</span>
                  {h.value_creation_plan}
                  {h.value_creation_source_url ? <Src url={h.value_creation_source_url} name="Source" className="ml-1.5" /> : null}
                </p>
              ) : null}
              {h.notes ? <p className="mt-0.5 text-[11.5px] text-muted-foreground">{h.notes}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {unconfirmed.length ? (
        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          Unconfirmed leads, from secondary sources only: {unconfirmed.slice(0, 6).map((l) => `${l.name} (${l.title ?? l.role})`).join(", ")}. Not shown as executives until a primary source names them.
        </p>
      ) : null}
    </div>
  );
}
