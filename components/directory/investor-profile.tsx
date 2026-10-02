import Link from "next/link";
import { CommitmentTable, dateLabel } from "@/components/intel/tables";
import { Box, Empty, Src, Tag } from "@/components/intel/ui";
import { ASSET_CLASSES, ASSET_CLASS_BY_KEY, classOfGpType, fundClass, isAssetClassKey, type AssetClassKey } from "@/lib/directory/asset-classes";
import { formatMoney } from "@/lib/directory/intelligence-types";
import { profileSource, type InvestorPlan, type InvestorProfile as InvestorProfileRecord } from "@/lib/directory/investor-queries";
import type { CompanyFund, NamedCommitment } from "@/lib/directory/queries";
import { STRATEGY_BY_KEY, strategiesInFirmText, strategiesInFundName, type Strategy } from "@/lib/directory/strategies";
import {
  FOCUS_BY_CODE,
  INDUSTRY_BY_CODE,
  INVESTOR_PRACTICES,
  PLAN_STATUS_LABEL,
  REGION_BY_CODE,
  industriesInText,
  regionOfCountry,
  regionsInText,
  typeCodeOf,
  typeNameOf,
} from "@/lib/directory/taxonomy";
import type { Company } from "@/lib/types";

// The profiles a desk expects of an investor and of a manager, in the
// categories it expects them: type, size, allocations, preferences, the
// next twelve months, past investments; type, classes, strategies, sectors,
// regions, funds by strategy. Every category is on every firm. A value shows
// with the page that states it; a category nobody has researched yet says
// so, and one researched with nothing public found says that instead.
// Server components: nothing here needs the browser.

const dash = <span className="text-muted-foreground">—</span>;

function Row({ label, children, src }: { label: string; children: React.ReactNode; src?: React.ReactNode }) {
  return (
    <div className="min-w-0 py-1.5">
      <dt className="desk-label">{label}</dt>
      <dd className="mt-0.5 text-[13px]">
        {children} {src}
      </dd>
    </div>
  );
}

function Pending({ none }: { none: boolean }) {
  return <span className="text-muted-foreground">{none ? "No public source found" : "Not yet researched"}</span>;
}

function TagList({ items }: { items: { key: string; label: string; title?: string }[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((t) => (
        <Tag key={t.key} title={t.title}>
          {t.label}
        </Tag>
      ))}
    </span>
  );
}

/** A ticket range as stated, in USD; one bound alone reads as "from" or "up to". */
function ticketLabel(min: number | null, max: number | null): string | null {
  if (min != null && max != null) return `${formatMoney(min, "USD")}–${formatMoney(max, "USD")}`;
  if (min != null) return `from ${formatMoney(min, "USD")}`;
  if (max != null) return `up to ${formatMoney(max, "USD")}`;
  return null;
}

function classLabel(key: string): string {
  return isAssetClassKey(key) ? ASSET_CLASS_BY_KEY[key].name : key;
}

// --- Investor -----------------------------------------------------------------

export function InvestorProfile({
  company,
  profile,
  plans,
  commitments,
}: {
  company: Company;
  profile: InvestorProfileRecord | null;
  plans: InvestorPlan[];
  /** The firm's disclosed commitments as an LP, already named. */
  commitments: NamedCommitment[];
}) {
  const d = profile;
  const none = d?.research_state === "no_public_data";
  const src = (field: string) => {
    const s = profileSource(d, field);
    return s ? <Src url={s.url} name={s.name ?? "Source"} asOf={s.as_of} /> : null;
  };
  const show = (label: string, v: React.ReactNode | null | undefined, field: string) => (
    <Row key={label} label={label} src={v == null || v === "" ? null : src(field)}>
      {v == null || v === "" ? <Pending none={none} /> : v}
    </Row>
  );

  // The research job's type wins; the directory's own type stands in until
  // then, and says it is the directory's.
  const researchedType = d?.investor_type ? typeNameOf("LP", d.investor_type) : null;
  const directoryType = typeNameOf("LP", typeCodeOf("LP", company.sub_type, company.description)) ?? company.investor_type ?? company.sub_type ?? null;
  const strategies = (d?.strategy_prefs ?? []).map((k) => ({ key: k, label: STRATEGY_BY_KEY[k]?.name ?? k, title: STRATEGY_BY_KEY[k] ? classLabel(STRATEGY_BY_KEY[k].classKey) : undefined }));
  const regions = (d?.region_prefs ?? []).map((k) => ({ key: k, label: REGION_BY_CODE[k]?.name ?? k }));
  const industries = (d?.industry_prefs ?? []).map((k) => ({ key: k, label: INDUSTRY_BY_CODE[k]?.name ?? FOCUS_BY_CODE[k]?.focus.name ?? k }));
  const practices = (d?.practices ?? []).map((k) => ({ key: k, label: INVESTOR_PRACTICES[k as keyof typeof INVESTOR_PRACTICES] ?? k }));
  const allocations = d?.allocations ?? [];
  const filled = d
    ? [d.investor_type, d.aum_usd, allocations.length ? 1 : null, strategies.length ? 1 : null, regions.length ? 1 : null, industries.length ? 1 : null, d.ticket_min_usd ?? d.ticket_max_usd, practices.length ? 1 : null, d.active_in_alternatives, d.overview].filter((v) => v != null).length
    : 0;
  const total = 10;
  const disclosed = commitments.filter((c) => c.source !== "sample");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
        <span>
          Investor profile: <span className="figure text-foreground">{filled}</span> of {total} researched categories filled
          {d?.researched_at ? ` · researched ${d.researched_at.slice(0, 10)}` : d ? ` · ${none ? "no public source found" : "pending"}` : " · not yet researched"}
        </span>
        <span>Every value carries the page that states it; nothing is estimated.</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Box title="Investor">
          <dl className="divide-y">
            <Row label="Investor type" src={researchedType ? src("investor_type") : null}>
              {researchedType ?? (directoryType ? <>{directoryType} <span className="text-[10.5px] text-muted-foreground">directory</span></> : <Pending none={none} />)}
            </Row>
            {show("Assets under management", d?.aum_usd != null ? <><span className="figure">{formatMoney(d.aum_usd, "USD")}</span> <span className="text-[10.5px] text-muted-foreground">USD{d.aum_as_of ? `, as of ${d.aum_as_of}` : ""}</span></> : null, "aum_usd")}
            {show("Active in alternatives", d?.active_in_alternatives == null ? null : d.active_in_alternatives ? "Yes" : "No — says it no longer invests in alternatives", "active_in_alternatives")}
            {show("Ticket size", ticketLabel(d?.ticket_min_usd ?? null, d?.ticket_max_usd ?? null) ? <><span className="figure">{ticketLabel(d?.ticket_min_usd ?? null, d?.ticket_max_usd ?? null)}</span> <span className="text-[10.5px] text-muted-foreground">USD, per fund</span></> : null, "ticket_min_usd")}
            {show("Practices", practices.length ? <TagList items={practices} /> : null, "practices")}
          </dl>
        </Box>

        <Box title="Overview">
          <p className="text-[13px] leading-relaxed">{d?.overview ? <>{d.overview} {src("overview")}</> : <Pending none={none} />}</p>
          {company.discloses_commitments ? (
            <p className="mt-3 text-[11.5px] text-muted-foreground">
              Commitment disclosure: {company.discloses_commitments} <Src url={company.disclosure_source_url} name="disclosure page" />
            </p>
          ) : null}
        </Box>
      </div>

      <Box title="Allocations by asset class" count={allocations.length || null} flush defn="The investor's own stated allocation per class: current and target percentages and the current amount, each as of the date the page gives.">
        {allocations.length ? (
          <div className="desk-scroll">
            <table className="desk-table">
              <thead>
                <tr>
                  <th>Asset class</th>
                  <th className="num">Current</th>
                  <th className="num">Target</th>
                  <th className="num">Current (USD)</th>
                  <th>As of</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {allocations.map((a, i) => (
                  <tr key={`${a.class}-${i}`}>
                    <td className="font-medium">
                      {isAssetClassKey(a.class) ? (
                        <Link href={`/database/asset-classes/${ASSET_CLASS_BY_KEY[a.class].slug}`} className="hover:underline">
                          {ASSET_CLASS_BY_KEY[a.class].name}
                        </Link>
                      ) : (
                        a.class
                      )}
                    </td>
                    <td className="num">{a.current_pct != null ? `${a.current_pct}%` : "—"}</td>
                    <td className="num">{a.target_pct != null ? `${a.target_pct}%` : "—"}</td>
                    <td className="num">{a.current_usd != null ? formatMoney(a.current_usd, "USD") : "—"}</td>
                    <td className="whitespace-nowrap text-muted-foreground">{a.as_of ?? "—"}</td>
                    <td>{src("allocations") ?? dash}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            <Pending none={none} />
          </Empty>
        )}
      </Box>

      <Box title="Preferences" defn="Strategies, regions and industries the investor says it favours, in its own policy statement or report.">
        <dl className="divide-y">
          {show("Strategies", strategies.length ? <TagList items={strategies} /> : null, "strategy_prefs")}
          {show("Regions", regions.length ? <TagList items={regions} /> : null, "region_prefs")}
          {show("Industries", industries.length ? <TagList items={industries} /> : null, "industry_prefs")}
        </dl>
      </Box>

      <Box title="Plans for the next twelve months" count={plans.length || null} flush defn="What the investor itself says it will do, per asset class, with the page that states it. Status is the investor's: investing, considering, or not investing.">
        {plans.length ? (
          <div className="desk-scroll">
            <table className="desk-table">
              <thead>
                <tr>
                  <th>Asset class</th>
                  <th>Status</th>
                  <th>Plans</th>
                  <th>Strategies</th>
                  <th>Regions</th>
                  <th className="num">Ticket (USD)</th>
                  <th>New GP relationships</th>
                  <th>As of</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td className="min-w-[160px] font-medium">
                      {classLabel(p.asset_class)}
                      {p.note ? <div className="mt-0.5 max-w-[320px] text-[11px] font-normal leading-snug text-muted-foreground">{p.note}</div> : null}
                    </td>
                    <td className="whitespace-nowrap">
                      <Tag strong={p.status === "investing"}>{PLAN_STATUS_LABEL[p.status] ?? p.status}</Tag>
                    </td>
                    <td className="max-w-[220px]">{p.plan_types?.length ? <TagList items={p.plan_types.map((t) => ({ key: t, label: t }))} /> : dash}</td>
                    <td className="max-w-[240px]">{p.strategies?.length ? <TagList items={p.strategies.map((k) => ({ key: k, label: STRATEGY_BY_KEY[k]?.name ?? k }))} /> : dash}</td>
                    <td className="max-w-[200px]">{p.regions?.length ? <TagList items={p.regions.map((k) => ({ key: k, label: REGION_BY_CODE[k]?.name ?? k }))} /> : dash}</td>
                    <td className="num whitespace-nowrap">
                      {ticketLabel(p.ticket_min_usd, p.ticket_max_usd) ?? "—"}
                      {p.funds_planned != null ? <div className="text-[10px] text-muted-foreground">{p.funds_planned} fund{p.funds_planned === 1 ? "" : "s"} planned</div> : null}
                    </td>
                    <td className="text-muted-foreground">{p.new_gp_relationships == null ? "—" : p.new_gp_relationships ? "Yes" : "No"}</td>
                    <td className="whitespace-nowrap text-muted-foreground">{dateLabel(p.as_of)}</td>
                    <td className="max-w-[180px] whitespace-nowrap">
                      <span className="block truncate">
                        <Src url={p.source_url} name={p.source_name ?? p.source_kind ?? "Source"} asOf={p.as_of} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            <Pending none={none} />
          </Empty>
        )}
      </Box>

      <Box
        title="Past investments"
        count={disclosed.length}
        flush
        defn="Commitments the investor has disclosed to funds, from its own reports and minutes and the public registers. Amounts keep their own currency; a figure the document does not print is blank."
        action={
          disclosed.length ? (
            <Link href={`/database/commitments?lp=${encodeURIComponent(disclosed[0]?.lp_label ?? company.name)}`} className="text-[11.5px] text-muted-foreground hover:text-foreground">
              On the commitments desk
            </Link>
          ) : null
        }
      >
        {disclosed.length ? <CommitmentTable rows={disclosed} showClass /> : <Empty>No disclosed commitments on file for this investor.</Empty>}
      </Box>
    </div>
  );
}

// --- Manager ------------------------------------------------------------------

export function ManagerProfile({ company, funds }: { company: Company; funds: CompanyFund[] }) {
  // Everything here is read from words the record already carries: the
  // directory's type, the firm's vertical and overview, its funds' legal
  // names. No research job writes a manager profile; nothing is inferred.
  const text = [company.directory_vertical, company.description].filter(Boolean).join(" ");
  const typeName = typeNameOf("GP", typeCodeOf("GP", company.sub_type));
  const baseClass = classOfGpType(company.sub_type);

  const stated: Strategy[] = [];
  for (const c of ASSET_CLASSES) for (const s of strategiesInFirmText(text, c.key)) if (!stated.some((x) => x.key === s.key)) stated.push(s);
  const classes: AssetClassKey[] = ASSET_CLASSES.map((c) => c.key).filter((k) => k === baseClass || stated.some((s) => s.classKey === k));
  const strategies = stated.filter((s) => s.axis === "strategy");
  const sectors = stated.filter((s) => s.axis === "sector");
  const industries = industriesInText([text, company.industry].filter(Boolean).join(" "));
  const regions = [...new Set([regionOfCountry(company.country), ...regionsInText(company.geographic_focus)].filter(Boolean))] as string[];

  // Funds by strategy: a fund is placed by its own legal name within the
  // class its name states, else its manager's class; a name that says no
  // strategy is counted as unplaced, never guessed.
  const byStrategy = new Map<string, { strategy: Strategy; funds: CompanyFund[] }>();
  let unplaced = 0;
  let unclassed = 0;
  for (const f of funds) {
    const fc = fundClass(f.name_filed ?? f.name, company.sub_type);
    if (!fc) {
      unclassed += 1;
      continue;
    }
    const hits = strategiesInFundName(f.name_filed ?? f.name, fc.key);
    if (!hits.length) {
      unplaced += 1;
      continue;
    }
    for (const s of hits) {
      const e = byStrategy.get(s.key) ?? { strategy: s, funds: [] };
      e.funds.push(f);
      byStrategy.set(s.key, e);
    }
  }
  const strategyRows = [...byStrategy.values()].sort((a, b) => b.funds.length - a.funds.length || a.strategy.name.localeCompare(b.strategy.name));
  const nothing = !text && !company.sub_type && !funds.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
        <span>
          Manager profile: read from the firm&rsquo;s own record — its directory type, vertical and overview — and the legal names in its fund lineup.
        </span>
        <span>No research job writes a manager profile yet; nothing here is inferred beyond those words.</span>
      </div>

      {nothing ? (
        <Box title="Manager">
          <Empty>Not yet researched — the firm&rsquo;s record carries no type or overview to read, and no fund is on file.</Empty>
        </Box>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Box title="Manager">
            <dl className="divide-y">
              <Row label="Manager type">{typeName ?? company.sub_type ?? dash}</Row>
              <Row label="Asset classes" src={baseClass ? <span className="text-[10.5px] text-muted-foreground">by directory type{stated.length ? " and stated strategies" : ""}</span> : null}>
                {classes.length ? (
                  <span className="flex flex-wrap gap-1">
                    {classes.map((k) => (
                      <Link key={k} href={`/database/asset-classes/${ASSET_CLASS_BY_KEY[k].slug}`} className="tag hover:text-foreground">
                        {ASSET_CLASS_BY_KEY[k].name}
                      </Link>
                    ))}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Not placed — the directory gives no type and the overview names no strategy</span>
                )}
              </Row>
              <Row label="Regions" src={<span className="text-[10.5px] text-muted-foreground">HQ country{company.geographic_focus ? " and stated geographic focus" : ""}</span>}>
                {regions.length ? <TagList items={regions.map((k) => ({ key: k, label: REGION_BY_CODE[k]?.name ?? k }))} /> : dash}
              </Row>
              {company.geographic_focus ? <Row label="Geographic focus, as stated">{company.geographic_focus}</Row> : null}
              {company.directory_vertical ? <Row label="Vertical">{company.directory_vertical}</Row> : null}
            </dl>
          </Box>

          <Box title="Stated in the firm's own overview" defn="Strategies and sectors placed by words in the firm's vertical and overview as the directory records them. A strategy the words do not name is not here.">
            {text ? (
              <dl className="divide-y">
                <Row label="Strategies">{strategies.length ? <TagList items={strategies.map((s) => ({ key: s.key, label: s.name, title: classLabel(s.classKey) }))} /> : <span className="text-muted-foreground">None named</span>}</Row>
                <Row label="Sectors">{sectors.length ? <TagList items={sectors.map((s) => ({ key: s.key, label: s.name, title: classLabel(s.classKey) }))} /> : <span className="text-muted-foreground">None named</span>}</Row>
                <Row label="Industries">
                  {industries.length ? (
                    <TagList
                      items={industries.map((i) => ({
                        key: i.industry,
                        label: INDUSTRY_BY_CODE[i.industry]?.name ?? i.industry,
                        title: i.focus.length ? i.focus.map((f) => FOCUS_BY_CODE[f]?.focus.name ?? f).join(", ") : undefined,
                      }))}
                    />
                  ) : (
                    <span className="text-muted-foreground">None named</span>
                  )}
                </Row>
              </dl>
            ) : (
              <Empty>Not yet researched — the record carries no overview to read.</Empty>
            )}
          </Box>
        </div>
      )}

      <Box title="Funds by strategy" count={funds.length || null} flush defn="Each fund placed by its own legal name within its class; a name that states no strategy is counted as unplaced, never guessed.">
        {strategyRows.length ? (
          <div className="desk-scroll">
            <table className="desk-table">
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th>Class</th>
                  <th className="num">Funds</th>
                  <th>Examples</th>
                </tr>
              </thead>
              <tbody>
                {strategyRows.map(({ strategy, funds: list }) => (
                  <tr key={strategy.key}>
                    <td className="font-medium" title={strategy.blurb}>
                      {strategy.name}
                      {strategy.axis === "sector" ? <span className="ml-1 text-[10.5px] font-normal text-muted-foreground">sector</span> : null}
                    </td>
                    <td className="whitespace-nowrap">
                      <Link href={`/database/asset-classes/${ASSET_CLASS_BY_KEY[strategy.classKey].slug}`} className="tag hover:text-foreground">
                        {ASSET_CLASS_BY_KEY[strategy.classKey].short}
                      </Link>
                    </td>
                    <td className="num">{list.length}</td>
                    <td className="max-w-[480px] text-[11.5px] text-muted-foreground">
                      {list.slice(0, 3).map((f, i) => (
                        <span key={f.id}>
                          <Link href={`/funds/${f.id}`} className="hover:underline">
                            {f.name}
                          </Link>
                          {i < Math.min(3, list.length) - 1 ? ", " : ""}
                        </span>
                      ))}
                      {list.length > 3 ? ` +${list.length - 3}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : funds.length ? (
          <Empty>None of the {funds.length} funds on file states a strategy in its legal name.</Empty>
        ) : (
          <Empty>No funds on file for this manager.</Empty>
        )}
        {funds.length && (unplaced || unclassed) ? (
          <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
            {[unplaced ? `${unplaced} fund${unplaced === 1 ? "" : "s"} whose name states no strategy` : null, unclassed ? `${unclassed} that neither the name nor the manager’s type places in a class` : null].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </Box>
    </div>
  );
}
