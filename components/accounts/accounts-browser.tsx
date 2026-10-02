"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, ChevronRight, Handshake, Mail, Phone, Radar, Users } from "lucide-react";
import { ACCOUNT_STATUSES, ACCOUNT_TIERS } from "@/lib/accounts";
import { formatOpsMoney, type OpsLeadSummary } from "@/lib/ops-types";
import type { AccountWithRefs } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { FacetChips, FacetMenu } from "@/components/intel/facet-menu";
import { ListToolbar, ShowMore, SortSelect, facetOptions } from "@/components/list-toolbar";
import { EmptyState } from "@/components/empty-state";
import { AccountStatusBadge } from "@/components/accounts/status-badge";
import { NewAccountDialog } from "@/components/accounts/new-account-dialog";
import type { Sponsorship } from "@/lib/account-sponsorships";
import { initials } from "@/lib/utils";

const PAGE = 60;
type Sort = "name" | "recent" | "contacts" | "renewal";
const SORTS: { value: Sort; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "recent", label: "Recently updated" },
  { value: "contacts", label: "Most contacts" },
  { value: "renewal", label: "Renewal date" },
];
const CATEGORY_LABEL: Record<string, string> = { LP: "LP — investor", GP: "GP — fund manager", SP: "SP — solution provider", UN: "Unclassified" };

export function AccountsBrowser({
  accounts,
  opsByAccount,
  sponsorships = {},
}: {
  accounts: AccountWithRefs[];
  opsByAccount: Record<string, OpsLeadSummary>;
  /** What each account paid per year, from the sponsor lists. */
  sponsorships?: Record<string, Sponsorship[]>;
}) {
  const [q, setQ] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [tiers, setTiers] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>("name");
  const [shown, setShown] = useState(PAGE);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = accounts.filter((a) => {
      if (statuses.length && !statuses.includes(a.status)) return false;
      if (categories.length && !categories.includes(a.category ?? "")) return false;
      if (tiers.length && !tiers.includes(a.tier ?? "")) return false;
      if (!needle) return true;
      return (
        a.name.toLowerCase().includes(needle) ||
        (a.primary_contact?.full_name ?? "").toLowerCase().includes(needle) ||
        (a.ops_company ?? "").toLowerCase().includes(needle)
      );
    });
    return rows.sort((a, b) => {
      switch (sort) {
        case "recent":
          return b.updated_at.localeCompare(a.updated_at);
        case "contacts":
          return b.contact_count - a.contact_count || a.name.localeCompare(b.name);
        case "renewal":
          return (a.renewal_date ?? "9999").localeCompare(b.renewal_date ?? "9999") || a.name.localeCompare(b.name);
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [accounts, q, statuses, categories, tiers, sort]);

  if (!accounts.length) {
    return (
      <EmptyState
        icon={<Handshake />}
        title="No sponsor accounts yet"
        description="An account is a sponsor you have won. Every company with a deal in the ops panel becomes one on the next sync; otherwise create one, or convert a confirmed lead from its page."
        action={<NewAccountDialog />}
      />
    );
  }

  const statusOptions = facetOptions(accounts, (a) => a.status, { order: ACCOUNT_STATUSES });
  const categoryOptions = facetOptions(accounts, (a) => a.category, { label: (k) => CATEGORY_LABEL[k] ?? k });
  const tierOptions = facetOptions(accounts, (a) => a.tier, { order: ACCOUNT_TIERS }).filter((o) => o.count > 0);
  const clearAll = () => {
    setQ("");
    setStatuses([]);
    setCategories([]);
    setTiers([]);
  };

  return (
    <div className="space-y-3">
      <ListToolbar
        search={{ value: q, onChange: setQ, placeholder: "Search sponsors or contacts" }}
        facets={
          <>
            <FacetMenu label="Status" groups={[{ label: "", options: statusOptions }]} selected={statuses} onChange={setStatuses} searchable={false} width={200} />
            <FacetMenu label="Category" groups={[{ label: "", options: categoryOptions }]} selected={categories} onChange={setCategories} searchable={false} width={220} />
            <FacetMenu label="Tier" groups={[{ label: "", options: tierOptions }]} selected={tiers} onChange={setTiers} searchable={false} width={180} />
          </>
        }
        sort={<SortSelect value={sort} onChange={setSort} options={SORTS} />}
        shown={filtered.length}
        total={accounts.length}
        noun="accounts"
        chips={
          <FacetChips
            chips={[
              ...statuses.map((k) => ({ key: `s:${k}`, label: k, remove: () => setStatuses(statuses.filter((x) => x !== k)) })),
              ...categories.map((k) => ({ key: `c:${k}`, label: CATEGORY_LABEL[k] ?? k, remove: () => setCategories(categories.filter((x) => x !== k)) })),
              ...tiers.map((k) => ({ key: `t:${k}`, label: k, remove: () => setTiers(tiers.filter((x) => x !== k)) })),
            ]}
            onClearAll={clearAll}
          />
        }
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="No accounts match these filters"
          description={`${accounts.length} sponsor accounts are on the book; none carry every filter you have set.`}
          action={
            <button type="button" onClick={clearAll} className="rounded-[4px] border bg-card px-2.5 py-1 text-[12px] hover:bg-accent">
              Clear filters
            </button>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.slice(0, shown).map((a) => (
              <AccountCard key={a.id} account={a} ops={opsByAccount[a.id] ?? null} paid={sponsorships[a.id] ?? []} />
            ))}
          </div>
          <ShowMore remaining={filtered.length - shown} step={PAGE} onClick={() => setShown(shown + PAGE)} />
        </>
      )}
    </div>
  );
}

function AccountCard({
  account,
  ops,
  paid,
}: {
  account: AccountWithRefs;
  ops: OpsLeadSummary | null;
  paid: Sponsorship[];
}) {
  const poc = account.primary_contact;
  return (
    <Link href={`/accounts/${account.id}`} className="lift group flex flex-col rounded-2xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-[13px] font-semibold text-accent-foreground">
          {initials(account.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight" title={account.name}>
            {account.name}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <AccountStatusBadge status={account.status} className="text-[10px]" />
            {account.category ? (
              <Badge variant="outline" className="text-[10px]">
                {account.category}
              </Badge>
            ) : null}
            {account.tier ? (
              <Badge variant="secondary" className="text-[10px]">
                {account.tier}
              </Badge>
            ) : null}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>

      {/* Point of contact */}
      <div className="mt-3 rounded-xl bg-muted/50 px-3 py-2">
        {poc ? (
          <>
            <p className="truncate text-sm font-medium">{poc.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">{poc.job_title || poc.role || "Point of contact"}</p>
            <div className="mt-1 flex items-center gap-2.5 text-[11px] text-muted-foreground">
              {poc.email ? (
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3 w-3" /> email
                </span>
              ) : null}
              {poc.phone || poc.mobile ? (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3" /> phone
                </span>
              ) : null}
              <span className="ml-auto inline-flex items-center gap-1">
                <Users className="h-3 w-3" /> {account.contact_count}
              </span>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No point of contact yet — add one on the account</p>
        )}
      </div>

      {/* What they paid, by year, from the sponsor lists */}
      {paid.length ? (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {paid.slice(0, 3).map((p) => (
            <span key={`${p.year}-${p.currency}`} className="rounded-md border bg-background px-1.5 py-0.5 text-[10px]">
              {p.year} <span className="tabular text-muted-foreground">{p.amount != null ? formatOpsMoney(p.amount, p.currency) : "no amount"}</span>
            </span>
          ))}
        </div>
      ) : null}

      {/* Ops allocations */}
      {ops && ops.events.length ? (
        <div className="mt-2.5">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Radar className="h-3 w-3" /> Sponsoring
          </p>
          <ul className="mt-1 flex flex-wrap gap-1">
            {ops.events.slice(0, 3).map((e) => (
              <li key={e.event_id} className="rounded-md border bg-background px-1.5 py-0.5 text-[10px]">
                {e.event_name} <span className="tabular text-muted-foreground">{formatOpsMoney(e.allocated, e.currency)}</span>
              </li>
            ))}
            {ops.events.length > 3 ? <li className="px-1 py-0.5 text-[10px] text-muted-foreground">+{ops.events.length - 3} more</li> : null}
          </ul>
        </div>
      ) : null}

      {account.renewal_date ? (
        <p className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CalendarClock className="h-3 w-3" /> Renews {account.renewal_date}
        </p>
      ) : null}
    </Link>
  );
}
