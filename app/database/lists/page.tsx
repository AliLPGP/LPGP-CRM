import Link from "next/link";
import { ArrowRight, ListChecks } from "lucide-react";
import { listDirectoryLists } from "@/lib/directory/queries";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { NewListButton } from "@/components/directory/list-views";
import { EmptyState } from "@/components/empty-state";
import { IntelShell } from "@/components/intel/shell";
import { SetupNotice } from "@/components/setup-notice";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lists — LPGP Connect" };

export default async function ListsPage() {
  const lists = await listDirectoryLists();
  return (
    <IntelShell
      crumbs={[{ label: "Lists" }]}
      title="Lists"
      description="Target lists the team builds from search — shared, annotated, and one click from the pipeline."
      actions={<NewListButton />}
    >
      {!isSupabaseConfigured() ? <SetupNotice /> : null}
      {lists.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-5 w-5" />}
          title="No lists yet"
          description="Search in Discover, tick the firms you want and choose “Add to list” — or start an empty one here."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((l) => (
            <Link key={l.id} href={`/database/lists/${l.id}`} className="lift sheen flex flex-col rounded-2xl border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold leading-snug">{l.name}</h2>
                <span className="figure text-2xl">{l.item_count}</span>
              </div>
              {l.description ? <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{l.description}</p> : null}
              <div className="mt-auto flex items-center justify-between pt-4 text-xs text-muted-foreground">
                <span>
                  {l.owner_name ? `${l.owner_name} · ` : ""}updated {timeAgo(l.updated_at)}
                </span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </IntelShell>
  );
}
