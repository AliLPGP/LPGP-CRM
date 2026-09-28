// Display helpers for directory records. Pure: safe on the client.

import { formatUsd } from "../utils";
import { AUM_KIND_LABEL, type DirectoryRecord } from "./records";

export function sizeLabel(r: Pick<DirectoryRecord, "aum" | "aumKind">): string {
  return r.aum != null ? formatUsd(r.aum) : "—";
}

export function sizeTitle(r: Pick<DirectoryRecord, "aum" | "aumKind">): string | undefined {
  return r.aumKind ? AUM_KIND_LABEL[r.aumKind] : undefined;
}

export function headcountLabel(n: number | null): string {
  if (n == null) return "—";
  return n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString("en-US");
}

export const AUM_PRESETS: { label: string; min: number | null; max: number | null }[] = [
  { label: "Under $100M", min: null, max: 1e8 },
  { label: "$100M–$1B", min: 1e8, max: 1e9 },
  { label: "$1B–$10B", min: 1e9, max: 1e10 },
  { label: "$10B–$100B", min: 1e10, max: 1e11 },
  { label: "$100B+", min: 1e11, max: null },
];

export const EMPLOYEE_PRESETS: { label: string; min: number | null; max: number | null }[] = [
  { label: "1–50", min: null, max: 50 },
  { label: "51–200", min: 51, max: 200 },
  { label: "201–1,000", min: 201, max: 1000 },
  { label: "1,000+", min: 1000, max: null },
];

/** "$1B+", "Up to $500M", "$1B–$10B". */
export function rangeLabel(
  min: number | null,
  max: number | null,
  fmt: (n: number) => string = formatUsd,
): string {
  if (min != null && max != null) return `${fmt(min)}–${fmt(max)}`;
  if (min != null) return `${fmt(min)}+`;
  if (max != null) return `Up to ${fmt(max)}`;
  return "Any";
}

/** Parse "1.5b", "$500m", "250000000", "2k" → dollars. */
export function parseMoney(text: string): number | null {
  const m = text.trim().toLowerCase().replace(/[$,\s]/g, "").match(/^(\d+(?:\.\d+)?)([kmbt]|bn|mm|mn|tn)?$/);
  if (!m) return null;
  const unit: Record<string, number> = { k: 1e3, m: 1e6, mm: 1e6, mn: 1e6, b: 1e9, bn: 1e9, t: 1e12, tn: 1e12 };
  return Number(m[1]) * (m[2] ? unit[m[2]] : 1);
}
