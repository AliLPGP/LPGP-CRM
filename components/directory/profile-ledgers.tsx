"use client";

import { useState } from "react";
import Link from "next/link";
import { CommitmentTable, DealTable } from "@/components/intel/tables";
import { Box, Src, Tag } from "@/components/intel/ui";
import type { DisclosedCommitment, NamedCommitment } from "@/lib/directory/queries";
import type { Deal } from "@/lib/directory/intelligence-types";
import { formatUsd } from "@/lib/utils";
import { MORE_BUTTON } from "./profile-sections";

// A firm's ledgers on its profile: deals and commitments. Every row comes
// with the page and the first hundred are drawn at once; "Show more"
// lengthens the ledger in the browser, so a limited partner with 900
// disclosed commitments is a page, not four megabytes of table — and
// nothing is fetched again.

const STEP = 100;

function ShowMore({ left, onClick }: { left: number; onClick: () => void }) {
  if (left <= 0) return null;
  return (
    <div className="border-t px-3 py-2">
      <button type="button" onClick={onClick} className={MORE_BUTTON}>
        Show {Math.min(STEP, left).toLocaleString("en-US")} more
        <span className="ml-1 text-muted-foreground">of {left.toLocaleString("en-US")} left</span>
      </button>
    </div>
  );
}

/** The deals desk's ledger over a firm's deals, lengthened in the browser. */
export function DealLedger({ deals }: { deals: Deal[] }) {
  const [limit, setLimit] = useState(STEP);
  return (
    <>
      <DealTable deals={deals.slice(0, limit)} />
      <ShowMore left={deals.length - limit} onClick={() => setLimit(limit + STEP)} />
    </>
  );
}

/** The commitments desk's ledger over a firm's rows, lengthened in the browser. */
export function CommitmentLedger({ rows, showClass }: { rows: NamedCommitment[]; showClass?: boolean }) {
  const [limit, setLimit] = useState(STEP);
  return (
    <>
      <CommitmentTable rows={rows.slice(0, limit)} showClass={showClass} />
      <ShowMore left={rows.length - limit} onClick={() => setLimit(limit + STEP)} />
    </>
  );
}

function Amount({ c }: { c: DisclosedCommitment }) {
  if (c.amount != null && c.currency) {
    const n = c.amount;
    const short = n >= 1e9 ? `${+(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n.toLocaleString("en-US");
    const upTo = c.amount_text?.toLowerCase().startsWith("up to");
    return (
      <span title={c.amount_text ?? undefined}>
        {upTo ? <span className="mr-1 text-[11px] font-normal text-muted-foreground">up to</span> : null}
        {c.currency} {short}
      </span>
    );
  }
  if (c.amount_usd != null) return <>{formatUsd(c.amount_usd)}</>;
  return <span className="text-[11px] font-normal text-muted-foreground">{c.amount_text ?? "Undisclosed"}</span>;
}

/** Public commitments — as the LP that made them or the manager that won them. */
export function Commitments({ rows, as }: { rows: NamedCommitment[]; as: "lp" | "gp" }) {
  const [limit, setLimit] = useState(STEP);
  if (!rows.length) return null;
  return (
    <Box
      title={as === "lp" ? "Commitments made" : "Commitments received"}
      count={rows.length}
      flush
      defn={as === "lp" ? "Commitments this investor has disclosed to funds, from its own reports and the public registers." : "Commitments LPs have disclosed to this manager's funds, from their own reports and the public registers."}
      action={<span className="text-[11px] text-muted-foreground">Amounts in their own currency, never converted</span>}
    >
      <div className="desk-scroll">
        <table className="desk-table">
          <thead>
            <tr>
              <th>Fund</th>
              <th>{as === "lp" ? "Manager" : "LP"}</th>
              <th>When</th>
              <th className="num">Amount</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((c) => {
              const otherId = as === "lp" ? c.gp_company_id : c.lp_company_id;
              const otherName = as === "lp" ? c.gp_label : c.lp_label;
              return (
                <tr key={c.id} className="align-top">
                  <td className="max-w-[360px] font-medium">
                    {c.fund_id ? (
                      <Link href={`/funds/${c.fund_id}`} className="hover:underline">
                        {c.fund_label ?? "—"}
                      </Link>
                    ) : (
                      (c.fund_label ?? "—")
                    )}
                  </td>
                  <td className="text-muted-foreground">
                    {otherId ? (
                      <Link href={`/companies/${otherId}`} className="hover:underline">
                        {otherName ?? "—"}
                      </Link>
                    ) : (
                      (otherName ?? "—")
                    )}
                  </td>
                  <td className="whitespace-nowrap text-muted-foreground">{c.commitment_date_text ?? c.commitment_date ?? "—"}</td>
                  <td className="num whitespace-nowrap">
                    <Amount c={c} />
                  </td>
                  <td>{c.source === "sample" ? <Tag title="From the original seed; illustrative, not filed">Sample</Tag> : <Src url={c.source_url} name={c.disclosure_type ?? "Source"} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ShowMore left={rows.length - limit} onClick={() => setLimit(limit + STEP)} />
    </Box>
  );
}
