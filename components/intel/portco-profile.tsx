import { BadgeCheck } from "lucide-react";
import { Src } from "@/components/intel/ui";
import { formatMoney } from "@/lib/directory/intelligence-types";
import { confirmedLeader, sourceTier, type PortcoIntel } from "@/lib/directory/portco-intel";

// A portfolio company's profile facts, each value with the page it came from
// and how far that page can be trusted. Revenue, EBITDA, employees and the
// named executives only ever appear from primary sources (filings, the
// company, the sponsor, their releases) or major press; the database refuses
// the rest on the way in.

const TIER_LABEL = { primary: "primary source", press: "major press", secondary: "secondary" } as const;

export type FactSource = { url?: string; name?: string; kind?: string; as_of?: string | null; evidence?: string | null };

/** The page a value came from, with a check when it is a primary source or major press. Hover shows the sentence it states. */
export function SourceMark({ src }: { src: FactSource | undefined }) {
  if (!src?.url) return null;
  const tier = sourceTier(src.kind);
  return (
    <span className="inline-flex items-center gap-1 align-middle" title={src.evidence ? `“${src.evidence}”` : undefined}>
      {tier !== "secondary" ? <BadgeCheck className="h-3 w-3 text-muted-foreground" aria-label={TIER_LABEL[tier]} /> : null}
      <Src url={src.url} name={src.name ?? TIER_LABEL[tier]} asOf={src.as_of ?? undefined} />
    </span>
  );
}

const first = (intel: PortcoIntel, field: string): FactSource | undefined => intel.sources?.[field]?.[0];

export type ProfileFact = { k: string; v: React.ReactNode; src?: FactSource };

/** The company's facts as its profile states them (not its people), in the order a reader asks. */
export function profileFacts(intel: PortcoIntel | null): ProfileFact[] {
  const rows: ProfileFact[] = [];
  if (!intel) return rows;
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
  if (intel.email)
    rows.push({
      k: "Email",
      v: (
        <span className="select-all">
          {intel.email}
          {intel.email_type ? <span className="text-muted-foreground"> · {intel.email_type.replace("_", " ")}</span> : null}
        </span>
      ),
      src: first(intel, "email"),
    });
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
    rows.push({
      k: "Revenue",
      v: (
        <span>
          <span className="figure">{formatMoney(intel.revenue_stated, intel.revenue_currency)}</span>
          {intel.revenue_period ? <span className="text-muted-foreground"> · {intel.revenue_period}</span> : null}
        </span>
      ),
      src: first(intel, "revenue"),
    });
  if (intel.ebitda_stated != null)
    rows.push({
      k: "EBITDA",
      v: (
        <span>
          <span className="figure">{formatMoney(intel.ebitda_stated, intel.ebitda_currency)}</span>
          <span className="text-muted-foreground">{[intel.ebitda_period, intel.ebitda_basis].filter(Boolean).map((x) => ` · ${x}`).join("")}</span>
        </span>
      ),
      src: first(intel, "ebitda"),
    });
  return rows;
}

export type NamedLeader = { role: string; name: string; title: string; src?: FactSource };

/** The executives a primary source or major press confirms, chief executive first. */
export function confirmedLeaders(intel: PortcoIntel | null): NamedLeader[] {
  if (!intel) return [];
  const out: NamedLeader[] = [];
  for (const role of ["ceo", "cfo", "coo", "managing_director"] as const) {
    const l = confirmedLeader(intel, role);
    if (!l) continue;
    const label = role === "managing_director" ? "Managing Director" : role.toUpperCase();
    out.push({
      role: label,
      name: l.name,
      title: l.title && l.title.toUpperCase() !== label.toUpperCase() ? l.title : label,
      src: { url: l.source_url ?? undefined, kind: (intel.leaders ?? []).find((x) => x.name === l.name)?.source_kind ?? "company" },
    });
  }
  return out;
}
