import Link from "next/link";
import { CategoryBadge } from "@/components/category-badge";
import { CompanyLogo } from "@/components/company-logo";
import { ASSET_CLASS_BY_KEY, DEAL_KIND_LABEL, INVESTOR_TYPE_LABEL, SIGNAL_KIND_LABEL, type AssetClassKey } from "@/lib/directory/asset-classes";
import { brandDomain } from "@/lib/directory/brand-domains";
import { headcountLabel, sizeLabel, sizeTitle } from "@/lib/directory/format";
import { AMOUNT_BASIS_LABEL, formatMoney, type Deal, type Signal } from "@/lib/directory/intelligence-types";
import { portcoHref } from "@/lib/directory/portco-intel";
import { locationLabel, type DirectoryRecord } from "@/lib/directory/records";
import { ROLE_LABEL } from "@/lib/directory/providers";
import type { NamedCommitment } from "@/lib/directory/queries";
import { Empty, Src, Tag } from "./ui";

// The ledgers the intelligence screens share: deals, signals, firms, funds,
// commitments. Server components; dense, sortable in the browser where a
// screen wraps them in a client table.

export function dateLabel(iso: string | null | undefined, text?: string | null): string {
  if (iso) {
    const d = new Date(`${iso}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  }
  return text ?? "—";
}

function classTag(key: string) {
  const c = ASSET_CLASS_BY_KEY[key as AssetClassKey];
  return c ? (
    <Link href={`/database/asset-classes/${c.slug}`} className="tag hover:text-foreground">
      {c.short}
    </Link>
  ) : null;
}

export function DealTable({ deals, showClass = true, compact = false }: { deals: Deal[]; showClass?: boolean; compact?: boolean }) {
  if (!deals.length) return <Empty>No deals on file yet.</Empty>;
  return (
    <div className="desk-scroll">
      <table className="desk-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>{compact ? "Deal" : "Deal · investor → target"}</th>
            <th>Kind</th>
            {showClass ? <th>Class</th> : null}
            <th className="num">Stake</th>
            <th className="num">Amount</th>
            {!compact ? <th className="num">Valuation</th> : null}
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => (
            <tr key={d.id} className="linked">
              <td className="whitespace-nowrap text-muted-foreground">{dateLabel(d.date, d.date_text)}</td>
              <td className={compact ? "min-w-[200px] max-w-[420px]" : "min-w-[280px] max-w-[520px]"}>
                <Link href={`/database/deals/${d.id}`} className="cover block font-medium leading-snug">
                  {d.headline}
                </Link>
                {!compact ? (
                  <div className="mt-0.5 text-[11.5px] leading-snug">
                    {d.investor_company_id ? (
                      <Link href={`/companies/${d.investor_company_id}`}>{d.investor}</Link>
                    ) : d.investor_id ? (
                      <Link href={`/database/sports/investors/${d.investor_id}`}>{d.investor}</Link>
                    ) : (
                      <span>{d.investor}</span>
                    )}
                    {d.investor_type ? <span className="text-muted-foreground"> ({INVESTOR_TYPE_LABEL[d.investor_type] ?? d.investor_type})</span> : null}
                    <span className="text-muted-foreground"> → </span>
                    {d.target_team_id ? (
                      <Link href={`/database/sports/${d.target_team_id}`}>{d.target}</Link>
                    ) : d.target_company_id ? (
                      <Link href={`/companies/${d.target_company_id}`}>{d.target}</Link>
                    ) : d.target_key && d.target_kind === "company" ? (
                      <Link href={portcoHref(d.target_key)}>{d.target}</Link>
                    ) : (
                      <span>{d.target}</span>
                    )}
                    {d.co_investors?.length ? <span className="text-muted-foreground"> · with {d.co_investors.slice(0, 3).join(", ")}{d.co_investors.length > 3 ? ` +${d.co_investors.length - 3}` : ""}</span> : null}
                    {d.target_country ? <span className="text-muted-foreground"> · {d.target_country}</span> : null}
                  </div>
                ) : null}
                {d.summary && !compact ? <div className="mt-0.5 line-clamp-1 text-[11px] leading-snug text-muted-foreground">{d.summary}</div> : null}
              </td>
              <td>
                <Tag>{DEAL_KIND_LABEL[d.kind] ?? d.kind}</Tag>
              </td>
              {showClass ? <td>{classTag(d.asset_class)}</td> : null}
              <td className="num">{d.stake_pct != null ? `${d.stake_pct}%` : "—"}</td>
              <td className="num">
                {formatMoney(d.amount, d.currency)}
                {d.amount != null && d.amount_basis && d.amount_basis !== "unspecified" ? <div className="text-[10px] text-muted-foreground">{AMOUNT_BASIS_LABEL[d.amount_basis] ?? d.amount_basis}</div> : null}
              </td>
              {!compact ? <td className="num">{formatMoney(d.valuation, d.valuation_currency)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SignalList({ signals, showClass = true, limit }: { signals: Signal[]; showClass?: boolean; limit?: number }) {
  const rows = limit ? signals.slice(0, limit) : signals;
  if (!rows.length) return <Empty>No signals yet. The refresh job adds them daily once ANTHROPIC_API_KEY is set.</Empty>;
  return (
    <ul className="divide-y">
      {rows.map((s) => (
        <li key={s.id} className="flex gap-3 px-3 py-2.5">
          <div className="w-[76px] shrink-0 pt-0.5 text-[11px] text-muted-foreground">{dateLabel(s.date)}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Tag strong>{SIGNAL_KIND_LABEL[s.kind] ?? s.kind}</Tag>
              {showClass ? classTag(s.asset_class) : null}
              <a href={s.source_url ?? undefined} target="_blank" rel="noreferrer" className="font-medium leading-snug hover:underline">
                {s.headline}
              </a>
            </div>
            {s.summary ? <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{s.summary}</p> : null}
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-muted-foreground">
              <Src url={s.source_url} name={s.source_name} />
              {s.firms.length ? (
                <span className="flex flex-wrap gap-1">
                  {s.firms.slice(0, 4).map((f) => (
                    <Link key={f.id} href={`/companies/${f.id}`} className="tag hover:text-foreground">
                      {f.name}
                    </Link>
                  ))}
                </span>
              ) : s.entities.length ? (
                <span className="truncate">{s.entities.slice(0, 4).join(" · ")}</span>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function FirmTable({ firms, limit }: { firms: DirectoryRecord[]; limit?: number }) {
  const rows = limit ? firms.slice(0, limit) : firms;
  if (!rows.length) return <Empty>No firms in this class yet.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="desk-table">
        <thead>
          <tr>
            <th>Firm</th>
            <th>Type</th>
            <th>HQ</th>
            <th className="num">Size</th>
            <th className="num">Team</th>
            <th className="num">Funds</th>
            <th className="num">People</th>
            <th>ADV</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <Link href={`/companies/${r.id}`} className="flex items-center gap-2 font-medium">
                  <CompanyLogo name={r.name} domain={r.domain} size={22} />
                  <span className="truncate">{r.name}</span>
                  <CategoryBadge category={r.category} className="ml-1 rounded-[3px] px-1.5 py-0 text-[10px]" />
                </Link>
              </td>
              <td className="whitespace-nowrap text-muted-foreground">{r.subType ?? "—"}</td>
              <td className="whitespace-nowrap text-muted-foreground">{locationLabel(r) ?? "—"}</td>
              <td className="num" title={sizeTitle(r)}>
                {sizeLabel(r)}
              </td>
              <td className="num text-muted-foreground">{headcountLabel(r.employees)}</td>
              <td className="num text-muted-foreground">{r.funds || r.privateFunds || "—"}</td>
              <td className="num text-muted-foreground">{r.contacts || "—"}</td>
              <td>{r.adv ? <Tag>{r.adv === "ERA" ? "ERA" : "RIA"}</Tag> : <span className="text-muted-foreground">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** An LP's name without its trailing parenthetical (the full name stays in the tooltip). */
export const shortName = (n: string | null | undefined) => (n ?? "").replace(/\s*\([^)]*\)\s*$/, "") || (n ?? "");

/** A short label for where a disclosure came from: the page's host, else the first words of the stated type. */
function sourceLabel(url: string | null | undefined, type: string | null | undefined): string {
  try {
    if (url) return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* fall through */
  }
  return (type ?? "Source").split(/\s[—–-]\s/)[0].slice(0, 24);
}

export function CommitmentTable({ rows, showClass = false }: { rows: NamedCommitment[]; showClass?: boolean }) {
  if (!rows.length) return <Empty>No disclosed commitments in this class yet.</Empty>;
  // Performance columns appear when any row carries them (an LP's own
  // fund-by-fund review); a press-sourced commitment leaves them blank.
  const perf = rows.some((c) => c.net_irr != null || c.multiple != null || c.contributed != null);
  return (
    <div className="desk-scroll">
      <table className="desk-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Limited partner</th>
            <th>Fund</th>
            <th>Manager</th>
            {showClass ? <th>Class</th> : null}
            <th className="num">Commitment</th>
            {perf ? (
              <>
                <th className="num">Paid in</th>
                <th className="num">Distributed</th>
                <th className="num">Net IRR</th>
                <th className="num">Multiple</th>
              </>
            ) : null}
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td className="whitespace-nowrap text-muted-foreground">{c.commitment_date_text ?? c.commitment_year ?? "—"}</td>
              <td className="max-w-[240px]" title={c.lp_label ?? undefined}>
                <span className="block truncate">{c.lp_company_id ? <Link href={`/companies/${c.lp_company_id}`} className="font-medium">{shortName(c.lp_label)}</Link> : shortName(c.lp_label)}</span>
              </td>
              <td className="max-w-[300px]" title={c.fund_label ?? undefined}>
                <span className="block truncate">{c.fund_id ? <Link href={`/funds/${c.fund_id}`}>{c.fund_label}</Link> : c.fund_label}</span>
              </td>
              <td className="max-w-[200px]" title={c.gp_label ?? undefined}>
                <span className="block truncate">{c.gp_company_id ? <Link href={`/companies/${c.gp_company_id}`}>{c.gp_label}</Link> : c.gp_label}</span>
              </td>
              {showClass ? <td className="whitespace-nowrap">{c.asset_class ? classTag(c.asset_class) : null}</td> : null}
              <td className="num">{c.amount != null ? formatMoney(c.amount, c.currency) : (c.amount_text ? <span className="text-muted-foreground" title={c.amount_text}>{c.amount_text.length > 18 ? c.amount_text.slice(0, 16) + "…" : c.amount_text}</span> : "—")}</td>
              {perf ? (
                <>
                  <td className="num text-muted-foreground">{c.contributed != null ? formatMoney(c.contributed, c.currency) : "—"}</td>
                  <td className="num text-muted-foreground">{c.distributed != null ? formatMoney(c.distributed, c.currency) : "—"}</td>
                  <td className={`num ${c.net_irr != null && c.net_irr < 0 ? "text-[var(--destructive)]" : ""}`}>{c.net_irr != null ? `${c.net_irr.toFixed(1)}%` : "—"}</td>
                  <td className="num">{c.multiple != null ? `${c.multiple.toFixed(2)}x` : "—"}</td>
                </>
              ) : null}
              <td className="max-w-[160px] whitespace-nowrap" title={c.disclosure_type ?? undefined}>
                <span className="block truncate">
                  <Src url={c.source_url} name={sourceLabel(c.source_url, c.disclosure_type)} asOf={c.as_of ?? null} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProviderMini({ role, rows, covered, domainOf }: { role: string; rows: { key: string; name: string; companyId: string | null; clients: number; share: number }[]; covered: number; domainOf: (companyId: string | null) => string | null }) {
  const max = rows[0]?.clients ?? 1;
  return (
    <div className="min-w-0">
      <div className="desk-label mb-1.5">
        {ROLE_LABEL[role as keyof typeof ROLE_LABEL] ?? role}s <span className="figure normal-case tracking-normal">· {covered}</span>
      </div>
      <ul className="space-y-1">
        {rows.slice(0, 6).map((r) => (
          <li key={r.key}>
            <Link href={`/database/providers/${r.key}`} className="flex items-center gap-1.5 text-[12px]">
              <CompanyLogo name={r.name} domain={brandDomain(r.key, domainOf(r.companyId))} size={16} />
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="inline-block h-[4px] w-10 overflow-hidden rounded-[2px] bar-track">
                <span className="block h-full bar-fill" style={{ width: `${Math.round((r.clients / max) * 100)}%` }} />
              </span>
              <span className="figure w-6 text-right text-[11px] text-muted-foreground">{r.clients}</span>
            </Link>
          </li>
        ))}
        {rows.length === 0 ? <li className="text-[11.5px] text-muted-foreground">—</li> : null}
      </ul>
    </div>
  );
}
