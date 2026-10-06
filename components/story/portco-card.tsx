import Link from "next/link";
import { CompanyLogo } from "@/components/company-logo";
import { Chip } from "@/components/story/story";
import { formatMoney } from "@/lib/directory/intelligence-types";
import { portcoHref } from "@/lib/directory/portco-intel";
import { DEAL_BASIS_LABEL } from "@/lib/directory/portfolio";

/** What a holding needs to be drawn as a card. */
export type PortcoCardData = {
  id: string;
  name: string;
  domain: string | null;
  sector: string | null;
  hq: string | null;
  status: string | null;
  invested_year: number | null;
  exit_year?: number | null;
  intel_key?: string | null;
  deal_value?: number | null;
  deal_currency?: string | null;
  deal_value_basis?: string | null;
};

/** "Held" or "Exited", as the sponsor's page says; null when it says neither. */
export function holdingStatus(status: string | null | undefined): { label: string; held: boolean } | null {
  const s = (status ?? "").toLowerCase();
  if (!s) return null;
  if (s.startsWith("current")) return { label: "Held", held: true };
  if (s.startsWith("realized") || s.startsWith("realised") || s.startsWith("exit")) return { label: "Exited", held: false };
  return { label: status as string, held: false };
}

/** A portfolio company as a card: its mark, name, sector, the year in, whether still held, what was paid. Opens the company's page. */
export function PortcoCard({ p, note }: { p: PortcoCardData; note?: React.ReactNode }) {
  const href = p.intel_key ? portcoHref(p.intel_key) : null;
  const status = holdingStatus(p.status);
  const body = (
    <>
      <div className="flex items-center gap-3">
        <CompanyLogo name={p.name} domain={p.domain} size={34} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium">{p.name}</span>
          <span className="block truncate text-[11.5px] text-muted-foreground">{p.sector ?? p.hq ?? "—"}</span>
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {p.invested_year ? <Chip>{p.exit_year ? `${p.invested_year}–${p.exit_year}` : p.invested_year}</Chip> : null}
        {status ? <Chip strong={status.held}>{status.label}</Chip> : null}
        {p.deal_value != null ? <Chip title={DEAL_BASIS_LABEL[p.deal_value_basis ?? "unspecified"]}>{formatMoney(p.deal_value, p.deal_currency)}</Chip> : null}
        {note}
      </div>
    </>
  );
  return href ? (
    <Link href={href} className="story-card p-3.5">
      {body}
    </Link>
  ) : (
    <div className="story-card p-3.5">{body}</div>
  );
}
