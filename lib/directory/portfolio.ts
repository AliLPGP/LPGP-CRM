// Portfolio companies: shared shape and keys. Pure: safe on the client.

import { normDomain } from "./normalize";

export type PortfolioCompany = {
  id: string;
  gp_company_id: string;
  name: string;
  domain: string | null;
  description: string | null;
  sector: string | null;
  hq: string | null;
  status: string | null;
  invested_year: number | null;
  exit_year: number | null;
  fund_name: string | null;
  source: string;
  source_url: string | null;
  created_at: string;
  /** `borrower_key(name)`, the key shared with the loan books and `portco_intel` (migration 0022). */
  intel_key?: string | null;
  /** What the sponsor paid, as a page states it (migration 0023). */
  deal_value?: number | null;
  deal_currency?: string | null;
  deal_value_basis?: "enterprise_value" | "equity_value" | "stake_price" | "unspecified" | null;
  equity_invested?: number | null;
  stake_pct?: number | null;
  co_investors?: string[];
  deal_source_url?: string | null;
  researched_at?: string | null;
};

export const DEAL_BASIS_LABEL: Record<string, string> = { enterprise_value: "enterprise value", equity_value: "equity value", stake_price: "price of the stake", unspecified: "as reported" };

export function portfolioKey(gpId: string, name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|gmbh|plc|sa|ag|bv|co)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${gpId}:${slug || "unnamed"}`;
}

export function portfolioDomain(website: string | null | undefined): string | null {
  return normDomain(website ?? null);
}
