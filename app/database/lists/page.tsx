import Link from "next/link";
import { listDirectoryLists } from "@/lib/directory/queries";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { NewListButton } from "@/components/directory/list-views";
import { IntelShell } from "@/components/intel/shell";
import { Box, Empty, Stat, StatStrip } from "@/components/intel/ui";
import { SetupNotice } from "@/components/setup-notice";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lists — LPGP Connect" };

// The team's target lists, as a ledger: one row per list, newest change
// first, the row opening the list.

export default async function ListsPage() {
  const lists = await listDirectoryLists();
  const firms = lists.reduce((n, l) => n + l.item_count, 0);
  const owners = new Set(lists.map((l) => l.owner_name).filter(Boolean)).size;
  const newest = lists[0]?.updated_at ?? null;
  return (
    <IntelShell
      crumbs={[{ label: "Lists" }]}
      title="Lists"
      description="Target lists the team builds from search — shared, annotated, and one click from the pipeline."
      actions={<NewListButton />}
    >
      {!isSupabaseConfigured() ? <SetupNotice /> : null}
      <StatStrip>
        <Stat label="Lists" value={lists.length.toLocaleString("en-US")} basis="shared with the team" />
        <Stat label="Firms listed" value={firms.toLocaleString("en-US")} basis="across every list, a firm counted per list" />
        <Stat label="Owners" value={owners.toLocaleString("en-US")} basis="teammates who started one" />
        <Stat label="Last change" value={newest ? timeAgo(newest) : "—"} basis="the most recently updated list" />
      </StatStrip>
      <Box title="Every list" count={lists.length} flush defn="Most recently updated first.">
        {lists.length ? (
          <div className="desk-scroll">
            <table className="desk-table">
              <thead>
                <tr>
                  <th>List</th>
                  <th>What it is for</th>
                  <th className="num">Firms</th>
                  <th>Owner</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {lists.map((l) => (
                  <tr key={l.id} className="linked">
                    <td className="min-w-[200px] max-w-[320px]">
                      <Link href={`/database/lists/${l.id}`} className="cover block truncate font-medium" title={l.name}>
                        {l.name}
                      </Link>
                    </td>
                    <td className="max-w-[420px] truncate text-muted-foreground" title={l.description ?? undefined}>
                      {l.description ?? "—"}
                    </td>
                    <td className="num">{l.item_count.toLocaleString("en-US")}</td>
                    <td className="max-w-[180px] truncate text-muted-foreground">{l.owner_name ?? "—"}</td>
                    <td className="whitespace-nowrap text-muted-foreground" title={l.updated_at}>
                      {timeAgo(l.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No lists yet. Search in Discover, tick the firms you want and choose “Add to list” — or start an empty one with “New list” above.</Empty>
        )}
      </Box>
    </IntelShell>
  );
}
