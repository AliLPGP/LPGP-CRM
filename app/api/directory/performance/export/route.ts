import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { ASSET_CLASS_BY_KEY } from "@/lib/directory/asset-classes";
import { filterPerformance, performanceFilters, performanceSample, sortPerformance } from "@/lib/directory/investor-queries";
import { STRATEGY_BY_KEY } from "@/lib/directory/strategies";

// The Performance desk's funds tab as a sheet, under the same filters the
// page carries in its URL (class, status, size, vintage, latest, sort).
// Every figure is LP-reported or arithmetic on LP-reported figures, and the
// Sources column names every LP review behind the row. Fund size is USD as
// filed and the only money column. Signed-in users only.

export const maxDuration = 60;

const COLUMNS = [
  "Fund", "Fund ID", "Manager", "Manager ID", "Asset Class", "Strategy", "Vintage", "Fund Size USD (as filed)", "Fundraising Status",
  "Net IRR Median %", "Net IRR Min %", "Net IRR Max %", "Net Multiple Median", "Net Multiple Min", "Net Multiple Max",
  "RVPI Median (arithmetic)", "DPI Median (arithmetic)", "Called % Median (arithmetic)", "LPs Reporting", "LPs With Cash Flows",
  "Quartile On File", "Quartile Sample", "As Of", "Sources",
] as const;

function cell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const url = new URL(req.url);
  const filters = performanceFilters(Object.fromEntries(url.searchParams));
  const { rows: sample, newest } = await performanceSample();
  const rows = sortPerformance(filterPerformance(sample, filters, newest), filters.sort);
  const lines = rows.map((r) =>
    [
      r.fund_name,
      r.fund_id,
      r.manager_name,
      r.company_id,
      r.class ? ASSET_CLASS_BY_KEY[r.class].name : null,
      r.strategyKey ? (STRATEGY_BY_KEY[r.strategyKey]?.name ?? r.strategyKey) : null,
      r.vintage_year,
      r.fund_size_usd,
      r.fundraising_status,
      r.net_irr_median,
      r.net_irr_min,
      r.net_irr_max,
      r.multiple_median,
      r.multiple_min,
      r.multiple_max,
      r.rvpi_median,
      r.dpi_median,
      r.called_pct_median,
      r.lps,
      r.lps_with_cash,
      r.quartile ? `Q${r.quartile.q}` : null,
      r.quartile?.of ?? null,
      r.as_of,
      r.sources.map((s) => [s.lp ?? "LP", s.as_of ? `(${s.as_of})` : null, s.url].filter(Boolean).join(" ")).join("; "),
    ]
      .map(cell)
      .join(","),
  );
  const body = "﻿" + [COLUMNS.join(","), ...lines].join("\r\n");
  const name = `fund-performance${filters.cls ? "-" + filters.cls.replace(/_/g, "-") : ""}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
