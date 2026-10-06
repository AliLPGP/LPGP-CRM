import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { Chip, ClassIcon, fmtMult, fmtPct } from "@/components/story/story";
import { classStatedByFundName } from "@/lib/directory/asset-classes";
import { FUND_STAGE_LABEL, fundStage, type FundCard, type FundStage } from "@/lib/directory/fund-match";
import { formatUsd } from "@/lib/utils";

// A manager's funds as a reader wants them: one card per fund however many
// vehicles filed it, split into the funds still raising or investing and the
// ones closed, each with how it has done as its investors report it and the
// companies it holds. A card shows only what is on file: no blank metric,
// no zero standing in for "unknown".

/** Funds with something to tell first, then the newest. */
function rank(a: FundCard, b: FundCard) {
  const told = (f: FundCard) => (f.irr != null ? 4 : 0) + (f.companies.length ? 2 : 0) + (f.lps ? 1 : 0);
  return told(b) - told(a) || (b.vintage_year ?? 0) - (a.vintage_year ?? 0) || a.name.localeCompare(b.name);
}

function Card({ f, cls }: { f: FundCard; cls?: string | null }) {
  const stage = fundStage(f.status);
  // A size of zero is a blank in the filing, not a fund with no money.
  const size = f.fund_size_usd && f.fund_size_usd > 0 ? f.fund_size_usd : f.target_size_usd && f.target_size_usd > 0 ? f.target_size_usd : null;
  const metrics: { label: string; value: string }[] = [];
  if (f.irr != null) metrics.push({ label: "Net IRR", value: fmtPct(f.irr) });
  if (f.multiple != null) metrics.push({ label: "Multiple", value: fmtMult(f.multiple) });
  if (f.companies.length) metrics.push({ label: "Companies", value: String(f.companies.length) });
  else if (f.lps) metrics.push({ label: "Investors", value: String(f.lps) });
  return (
    <Link href={`/funds/${f.id}`} className="story-card flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <ClassIcon cls={classStatedByFundName(f.name_filed ?? f.name) ?? cls} />
        <span className="flex items-center gap-1.5">
          {stage ? <Chip strong={stage === "active"}>{FUND_STAGE_LABEL[stage]}</Chip> : null}
          <ArrowUpRight className="story-card-arrow h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 line-clamp-2 text-[15px] font-medium leading-snug">{f.name}</div>
      <div className="mt-1 text-[12px] text-muted-foreground">
        {[f.vintage_year ? `Vintage ${f.vintage_year}` : null, size != null ? `${formatUsd(size)}${size !== f.fund_size_usd ? " target" : ""}` : null, f.vehicles > 1 ? `${f.vehicles} vehicles` : null].filter(Boolean).join(" · ") || "As filed"}
      </div>
      {metrics.length ? (
        <dl className="mt-4 grid grid-cols-3 gap-2">
          {metrics.map((m) => (
            <div key={m.label}>
              <dt className="text-[11px] text-muted-foreground">{m.label}</dt>
              <dd className="figure text-[15px]">{m.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {f.companies.length ? (
        <div className="mt-auto flex items-center gap-2 pt-4">
          <span className="avatar-stack inline-flex items-center">
            {f.companies.slice(0, 5).map((c) => (
              <CompanyLogo key={c.id} name={c.name} domain={c.domain} size={22} />
            ))}
          </span>
          <span className="truncate text-[11.5px] text-muted-foreground">{f.companies.slice(0, 2).map((c) => c.name).join(", ")}{f.companies.length > 2 ? ` +${f.companies.length - 2}` : ""}</span>
        </div>
      ) : null}
    </Link>
  );
}

const GROUPS: { stage: FundStage; title: string; note: string }[] = [
  { stage: "active", title: "Active", note: "Raising or investing, as filed" },
  { stage: "closed", title: "Closed", note: "Closed to new investors, as filed" },
  { stage: null, title: "Other funds", note: "No status filed" },
];

/** The funds in up to three groups (active, closed, no status filed), each capped with a link to the rest. */
export function FundFamilies({ funds, cls, per = 6, moreHref }: { funds: FundCard[]; cls?: string | null; per?: number; moreHref?: string }) {
  const groups = GROUPS.map((g) => ({ ...g, rows: funds.filter((f) => fundStage(f.status) === g.stage).sort(rank) })).filter((g) => g.rows.length);
  const single = groups.length === 1;
  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <div key={g.title}>
          {single && g.stage === null ? null : (
            <div className="mb-3 flex items-baseline gap-2">
              <h3 className="text-[15px] font-semibold">{g.title}</h3>
              <span className="text-[12px] text-muted-foreground">
                {g.rows.length} · {g.note}
              </span>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {g.rows.slice(0, per).map((f) => (
              <Card key={f.id} f={f} cls={cls} />
            ))}
          </div>
          {g.rows.length > per && moreHref ? (
            <Link href={moreHref} className="mt-3 inline-block text-[12.5px] text-muted-foreground hover:text-foreground">
              And {g.rows.length - per} more{g.stage ? ` ${g.title.toLowerCase()}` : ""} {g.rows.length - per === 1 ? "fund" : "funds"} →
            </Link>
          ) : null}
        </div>
      ))}
    </div>
  );
}
