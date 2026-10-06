import { Box, Src } from "@/components/intel/ui";
import { formatMoney, type ClubFact } from "@/lib/directory/intelligence-types";

// The rest of a club's file: what its accounts, its site and the press state
// beyond the headline figures. Every row carries the page that states it; a
// category no page states is not drawn.

const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));

export type ClubFileRow = { label: string; value: string; src: ClubFact };

/** The club file as label, value and source, in the order a reader asks. */
export function clubFileRows(facts: Record<string, ClubFact> | null | undefined): ClubFileRow[] {
  if (!facts) return [];
  const out: ClubFileRow[] = [];
  const f = facts;
  const money = (x: ClubFact | undefined, label: string, note?: (x: ClubFact) => string | null) => {
    if (!x || x.amount == null) return;
    const n = note?.(x);
    out.push({ label, value: `${formatMoney(x.amount, x.currency)}${x.season ? ` · ${x.season}` : ""}${n ? ` · ${n}` : ""}`, src: x });
  };
  const rb = f.revenue_breakdown;
  if (rb && (rb.matchday != null || rb.broadcast != null || rb.commercial != null)) {
    const parts = [
      rb.matchday != null ? `matchday ${formatMoney(rb.matchday, rb.currency)}` : null,
      rb.broadcast != null ? `broadcast ${formatMoney(rb.broadcast, rb.currency)}` : null,
      rb.commercial != null ? `commercial ${formatMoney(rb.commercial, rb.currency)}` : null,
    ].filter(Boolean);
    out.push({ label: "Revenue split", value: `${parts.join(" · ")}${rb.season ? ` · ${rb.season}` : ""}`, src: rb });
  }
  money(f.wages, "Wages");
  money(f.operating_result, "Operating result", (x) => x.basis ?? null);
  money(f.pretax_result, "Pre-tax result");
  money(f.net_debt, "Net debt", (x) => (x.as_of ? `as of ${x.as_of}` : null));
  if (f.attendance?.average != null) out.push({ label: "Average attendance", value: `${fmt(f.attendance.average)}${f.attendance.season ? ` · ${f.attendance.season}` : ""}`, src: f.attendance });
  if (f.stadium_owner?.value) out.push({ label: "Stadium owner", value: f.stadium_owner.detail ?? f.stadium_owner.value.replace(/_/g, " "), src: f.stadium_owner });
  if (f.shirt_sponsor?.name) out.push({ label: "Shirt sponsor", value: f.shirt_sponsor.name, src: f.shirt_sponsor });
  if (f.kit_supplier?.name) out.push({ label: "Kit supplier", value: f.kit_supplier.name, src: f.kit_supplier });
  if (f.chair?.name) out.push({ label: f.chair.title ?? "Chair", value: f.chair.name, src: f.chair });
  if (f.chief_executive?.name) out.push({ label: f.chief_executive.title ?? "Chief executive", value: f.chief_executive.name, src: f.chief_executive });
  if (f.legal_entity?.name) out.push({ label: "Legal entity", value: `${f.legal_entity.name}${f.legal_entity.registry_id ? ` · ${f.legal_entity.registry ?? "registry"} ${f.legal_entity.registry_id}` : ""}`, src: f.legal_entity });
  if (f.honours?.league_titles != null) out.push({ label: "League titles", value: `${f.honours.league_titles}${f.honours.competition ? ` · ${f.honours.competition}` : ""}`, src: f.honours });
  return out;
}

/** The club file as a desk box, for dense screens. */
export function ClubFile({ facts }: { facts: Record<string, ClubFact> | null | undefined }) {
  const list = clubFileRows(facts);
  if (!list.length) return null;
  return (
    <Box title="Club file" count={list.length} flush defn="What the club's accounts, its own site and the press state beyond the headline figures. Every row carries the page that states it.">
      <table className="desk-table">
        <tbody>
          {list.map((r) => (
            <tr key={r.label}>
              <td className="desk-label whitespace-nowrap align-top">{r.label}</td>
              <td className="text-[12px]">{r.value}</td>
              <td className="whitespace-nowrap text-right">
                <Src url={r.src.source_url} name={r.src.source_name ?? "source"} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
}
