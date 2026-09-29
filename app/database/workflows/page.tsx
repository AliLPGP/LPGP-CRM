import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { IntelShell } from "@/components/intel/shell";
import { WorkflowIcon } from "@/components/intel/workflow-icon";
import { WORKFLOWS } from "@/lib/directory/workflows";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workflows — LPGP Connect" };

export default function WorkflowsPage() {
  return (
    <IntelShell
      crumbs={[{ label: "Workflows" }]}
      kicker="The desk"
      title="Workflows"
      description="The same records arranged for ten jobs — every panel is the directory, the fund universe, the LP disclosures, the deals and the signals, filtered and ranked for that job. Nothing here is a separate dataset."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {WORKFLOWS.map((w) => (
          <Link key={w.key} href={`/database/workflows/${w.slug}`} className="sheen group flex flex-col gap-2 rounded-[4px] border bg-card p-4 transition-colors hover:bg-accent/40">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-[4px] border bg-background text-foreground">
                <WorkflowIcon name={w.icon} className="h-4 w-4" />
              </span>
              <span className="display text-[15px]">{w.name}</span>
            </div>
            <p className="min-h-[3.2em] text-[12px] leading-snug text-muted-foreground">{w.blurb}</p>
            <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground group-hover:text-foreground">
              Open <ArrowUpRight className="h-3 w-3" />
            </span>
          </Link>
        ))}
      </div>
    </IntelShell>
  );
}
