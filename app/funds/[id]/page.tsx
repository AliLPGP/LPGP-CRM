import Link from "next/link";
import { IntelShell } from "@/components/intel/shell";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, ExternalLink, Layers } from "lucide-react";
import { getFund, getCommitmentsForFund } from "@/lib/queries";
import { formatUsd } from "@/lib/utils";
import { CategoryBadge } from "@/components/category-badge";
import { CompanyLogo } from "@/components/company-logo";
import { brandDomain } from "@/lib/directory/brand-domains";
import { ROLE_LABEL, normalizeRole } from "@/lib/directory/providers";
import { getFundDetails, getFundFormD } from "@/lib/fund-details";
import { FundProfile as FundProfileSections } from "@/components/intel/fund-profile";

export const dynamic = "force-dynamic";

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground/80">
      {children}
    </span>
  );
}

export default async function FundProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fund = await getFund(id);
  if (!fund) notFound();

  const [commitments, details, formD] = await Promise.all([getCommitmentsForFund(id), getFundDetails(id), getFundFormD(id)]);
  // Money stays in its own currency: only USD figures are summed.
  const totalCommitted = commitments.reduce((s, c) => s + (c.amount_usd ?? 0), 0);
  const providers = Array.isArray(fund.service_providers) ? fund.service_providers : [];
  const size = fund.fund_size_usd ?? fund.target_size_usd;

  return (
    <IntelShell wide={false}>
      <Link href="/funds" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Funds
      </Link>

      {/* Header */}
      <div className="sheen rounded-2xl border bg-card p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Fund <span className="mx-1">/</span> {fund.strategy ?? "Private markets"}
        </p>
        <h1 className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2.5">
          <Layers className="h-6 w-6 text-muted-foreground" />
          {fund.name}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {fund.manager ? (
            <Link href={`/companies/${fund.manager.id}`} className="inline-flex items-center gap-2 rounded-md border bg-secondary px-2.5 py-1 hover:bg-accent">
              <CompanyLogo name={fund.manager.name} domain={fund.manager.domain} size={20} />
              <span className="text-sm font-medium">{fund.manager.name}</span>
              <CategoryBadge category={fund.manager.category} />
            </Link>
          ) : null}
          {fund.vintage_year ? <Chip>Vintage {fund.vintage_year}</Chip> : null}
          {fund.geography ? <Chip>{fund.geography}</Chip> : null}
          {fund.status ? <Chip>{fund.status}</Chip> : null}
          {fund.vehicle_kind ? <Chip>{fund.vehicle_kind}</Chip> : null}
          {fund.domicile ? <Chip>{fund.domicile}</Chip> : null}
          {fund.currency ? <Chip>{fund.currency} class</Chip> : null}
        </div>
        {fund.name_filed && fund.name_filed !== fund.name ? (
          <p className="mt-3 text-xs text-muted-foreground">
            As filed: <span className="font-mono">{fund.name_filed}</span>
          </p>
        ) : null}
        {fund.source === "form_adv" ? (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            Named on the manager&rsquo;s Form ADV Schedule D{fund.filed ? ` (${fund.filed})` : ""}
            {fund.source_url ? (
              <a href={fund.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-foreground">
                IAPD <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </p>
        ) : null}
      </div>

      <FundProfileSections fund={fund} details={details} formD={formD} />

      {providers.length ? (
        <section className="sheen rounded-2xl border bg-card p-5">
          <h2 className="font-semibold">Service providers</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Named with this fund on the manager&rsquo;s Form ADV filing.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {providers.map((p) => (
              <Link
                key={`${p.role}:${p.key}`}
                href={`/database/providers/${p.key}`}
                className="flex items-center gap-3 rounded-xl border bg-background/50 p-3 hover:border-[var(--brass)]/50"
              >
                <CompanyLogo name={p.brand} domain={brandDomain(p.key)} size={36} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.brand}</span>
                  <span className="text-xs text-muted-foreground">{ROLE_LABEL[normalizeRole(p.role)]}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-6">
          <p className="eyebrow">Fund size</p>
          <div className="mt-2 text-3xl md:text-4xl font-semibold tracking-tight tabular">
            {size != null ? formatUsd(size) : <span className="text-muted-foreground text-2xl">Not set</span>}
          </div>
          {fund.fund_size_usd == null && fund.target_size_usd != null ? (
            <p className="mt-1 text-sm text-muted-foreground">Target (fundraising)</p>
          ) : null}
        </div>
        <div className="rounded-2xl border bg-card p-6">
          <p className="eyebrow">LP commitments</p>
          <div className="mt-2 text-3xl md:text-4xl font-semibold tracking-tight tabular">
            {commitments.length}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">tracked in your book</p>
        </div>
        <div className="rounded-2xl border bg-card p-6">
          <p className="eyebrow">Committed (tracked)</p>
          <div className="mt-2 text-3xl md:text-4xl font-semibold tracking-tight tabular">
            {totalCommitted > 0 ? formatUsd(totalCommitted) : "—"}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">across known LPs</p>
        </div>
      </div>

      {/* LP commitments */}
      <section className="sheen rounded-2xl border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">LP commitments</h2>
          <span className="text-sm text-muted-foreground">({commitments.length})</span>
        </div>
        {commitments.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground text-center">
            No LP commitments recorded for this fund yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-5 py-2.5">Limited Partner</th>
                <th className="text-left font-medium px-3 py-2.5">Date</th>
                <th className="text-right font-medium px-5 py-2.5">Commitment</th>
              </tr>
            </thead>
            <tbody>
              {commitments.map((c) => (
                <tr key={c.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-3">
                    {c.lp ? (
                      <Link href={`/companies/${c.lp.id}`} className="inline-flex items-center gap-2 font-medium hover:text-primary">
                        <CategoryBadge category={c.lp.category} />
                        {c.lp.name}
                      </Link>
                    ) : (
                      (c.lp_name ?? "—")
                    )}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {c.commitment_date_text ?? c.commitment_date ?? "—"}
                    {c.source_url ? (
                      <a href={c.source_url} target="_blank" rel="noreferrer" className="ml-1.5 inline-flex hover:text-foreground" title={c.disclosure_type ?? "Source"}>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </td>
                  <td className="px-5 py-3 text-right tabular font-medium">
                    {c.amount_usd != null
                      ? formatUsd(c.amount_usd)
                      : c.amount != null
                        ? `${formatUsd(c.amount).replace("$", "")} ${c.currency ?? ""}`
                        : (c.amount_text ?? "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </IntelShell>
  );
}
