import Link from "next/link";
import { getClassSummaries } from "@/lib/directory/asset-class-data";
import { IntelShell } from "@/components/intel/shell";
import { Box, Stat, StatStrip } from "@/components/intel/ui";
import { LogoStack } from "@/components/directory/viz";
import { formatUsd } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Asset classes — LPGP Intelligence" };

export default async function AssetClassesPage() {
  const classes = await getClassSummaries();
  const sum = (k: "managers" | "funds" | "deals" | "signals") => classes.reduce((n, c) => n + c[k], 0);
  const raum = classes.reduce((n, c) => n + (c.raum ?? 0), 0);
  return (
    <IntelShell
      crumbs={[{ label: "Asset classes" }]}
      title="Asset classes"
      description="The market by strategy: who manages in each class, what they raise, who services them, what has been committed and what is moving — with the source behind every figure."
    >
      <StatStrip>
        <Stat label="Asset classes" value={classes.length.toLocaleString("en-US")} basis="each with its own desk" />
        <Stat label="Managers" value={sum("managers").toLocaleString("en-US")} basis="placed by directory type" />
        <Stat label="Regulatory AUM" value={raum ? formatUsd(raum) : "—"} basis="Form ADV, brand totals once per class" />
        <Stat label="Funds" value={sum("funds").toLocaleString("en-US")} basis="by the fund's name, else its manager's type" />
        <Stat label="Deals" value={sum("deals").toLocaleString("en-US")} basis="sourced transactions" href="/database/deals" />
        <Stat label="Signals" value={sum("signals").toLocaleString("en-US")} basis="dated news items" href="/database/signals" />
      </StatStrip>
      <Box title="The classes" count={classes.length} flush>
        <div className="desk-scroll">
          <table className="desk-table">
            <thead>
              <tr>
                <th>Asset class</th>
                <th className="num">Managers</th>
                <th className="num">Regulatory AUM</th>
                <th className="num">Funds</th>
                <th className="num">Deals</th>
                <th className="num">Signals</th>
                <th>Largest managers</th>
              </tr>
            </thead>
            <tbody>
              {classes.map(({ cls, managers, raum, funds, deals, signals, top }) => (
                <tr key={cls.key} className="linked">
                  <td className="min-w-[240px]">
                    <Link href={`/database/asset-classes/${cls.slug}`} className="cover font-semibold">
                      {cls.name}
                    </Link>
                    <div className="max-w-[420px] truncate text-[11.5px] leading-snug text-muted-foreground" title={cls.blurb}>
                      {cls.blurb}
                    </div>
                  </td>
                  <td className="num">{managers.toLocaleString("en-US")}</td>
                  <td className="num" title="Form ADV regulatory AUM, brand totals counted once">
                    {raum ? formatUsd(raum) : "—"}
                  </td>
                  <td className="num">{funds.toLocaleString("en-US")}</td>
                  <td className="num">{deals.toLocaleString("en-US")}</td>
                  <td className="num">{signals.toLocaleString("en-US")}</td>
                  <td>
                    <LogoStack items={top} size={22} max={6} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Box>
      <p className="text-[11px] text-muted-foreground">
        A manager sits in a class by its directory type. A fund sits in a class when its own legal name says so, otherwise by its
        manager&rsquo;s type. Sports has no managers of its own: its money is in the clubs, leagues and the funds that buy into them.
      </p>
    </IntelShell>
  );
}
