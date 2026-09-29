import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getClassSummaries } from "@/lib/directory/asset-class-data";
import { IntelShell } from "@/components/intel/shell";
import { LogoStack } from "@/components/directory/viz";
import { formatUsd } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Asset classes — LPGP Connect" };

export default async function AssetClassesPage() {
  const classes = await getClassSummaries();
  return (
    <IntelShell
      crumbs={[{ label: "Asset classes" }]}
      title="Asset classes"
      description="The market by strategy: who manages in each class, what they raise, who services them, what has been committed and what is moving — with the source behind every figure."
    >
      <div className="overflow-x-auto rounded-[4px] border bg-card">
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
              <th />
            </tr>
          </thead>
          <tbody>
            {classes.map(({ cls, managers, raum, funds, deals, signals, top }) => (
              <tr key={cls.key}>
                <td>
                  <Link href={`/database/asset-classes/${cls.slug}`} className="font-semibold">
                    {cls.name}
                  </Link>
                  <div className="max-w-[420px] text-[11.5px] leading-snug text-muted-foreground">{cls.blurb}</div>
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
                <td>
                  <Link href={`/database/asset-classes/${cls.slug}`} className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground">
                    Open <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        A manager sits in a class by its directory type. A fund sits in a class when its own legal name says so, otherwise by its
        manager&rsquo;s type. Sports has no managers of its own: its money is in the clubs, leagues and the funds that buy into them.
      </p>
    </IntelShell>
  );
}
