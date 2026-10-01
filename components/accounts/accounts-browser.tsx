"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  ChevronRight,
  Handshake,
  Mail,
  Phone,
  Radar,
  Search,
  Users,
} from "lucide-react";
import { ACCOUNT_STATUSES } from "@/lib/accounts";
import { formatOpsMoney, type OpsLeadSummary } from "@/lib/ops-types";
import type { AccountWithRefs } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { EmptyState } from "@/components/empty-state";
import type { Sponsorship } from "@/lib/account-sponsorships";
import { cn, initials } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  Active: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  "Renewal due": "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  Prospect: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  Churned: "bg-destructive/12 text-destructive",
};

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
  const [status, setStatus] = useState("");

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return accounts.filter((a) => {
      if (status && a.status !== status) return false;
      if (!needle) return true;
      return (
        a.name.toLowerCase().includes(needle) ||
        (a.primary_contact?.full_name ?? "").toLowerCase().includes(needle) ||
        (a.ops_company ?? "").toLowerCase().includes(needle)
      );
    });
  }, [accounts, q, status]);

  if (!accounts.length) {
    return (
      <EmptyState
        icon={<Handshake className="mx-auto h-8 w-8" />}
        title="No sponsor accounts yet"
        description="Create one for each sponsor you've won, or convert a confirmed lead from its detail page. Each account carries its own points of contact and event allocations."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search sponsors or contacts…"
            className="pl-9"
          />
        </div>
        <NativeSelect
          className="w-[160px]"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Status"
        >
          <option value="">All statuses</option>
          {ACCOUNT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </NativeSelect>
        <span className="text-xs text-muted-foreground">
          {shown.length} of {accounts.length}
        </span>
      </div>

      {shown.length === 0 ? (
        <EmptyState title="Nothing matches" description="Try a different search or status." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((a) => (
            <AccountCard key={a.id} account={a} ops={opsByAccount[a.id] ?? null} paid={sponsorships[a.id] ?? []} />
          ))}
        </div>
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
    <Link
      href={`/accounts/${account.id}`}
      className="lift group flex flex-col rounded-2xl border bg-card p-4"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-sm font-bold text-primary">
          {initials(account.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">{account.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge
              className={cn("border-transparent text-[10px]", STATUS_STYLE[account.status] ?? "")}
            >
              {account.status}
            </Badge>
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

      {/* Points of contact */}
      <div className="mt-3 rounded-xl bg-muted/50 px-3 py-2">
        {poc ? (
          <>
            <p className="truncate text-sm font-medium">{poc.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {poc.job_title || poc.role || "Point of contact"}
            </p>
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
          <p className="text-xs text-muted-foreground">No points of contact added yet</p>
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
              <li
                key={e.event_id}
                className="rounded-md border bg-background px-1.5 py-0.5 text-[10px]"
              >
                {e.event_name}{" "}
                <span className="tabular text-muted-foreground">
                  {formatOpsMoney(e.allocated, e.currency)}
                </span>
              </li>
            ))}
            {ops.events.length > 3 ? (
              <li className="px-1 py-0.5 text-[10px] text-muted-foreground">
                +{ops.events.length - 3} more
              </li>
            ) : null}
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
