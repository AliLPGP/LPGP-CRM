"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Mail, Phone, Link2 } from "lucide-react";
import type { Category } from "@/lib/types";
import type { ContactListRow, ContactSearchResult } from "@/lib/queries";
import { CATEGORIES, CATEGORY_ORDER } from "@/lib/categories";
import { CategoryBadge } from "@/components/category-badge";
import { PersonAvatar } from "@/components/person-avatar";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Filter = Category | "ALL";

export type ContactRow = ContactListRow;

const PAGE = 100;

type Shown = ContactSearchResult & { key: string };

function paramsFor(filter: Filter, q: string, emailOnly: boolean, offset: number): string {
  const p = new URLSearchParams();
  if (filter !== "ALL") p.set("cat", filter);
  if (q.trim()) p.set("q", q.trim());
  if (emailOnly) p.set("email", "1");
  p.set("offset", String(offset));
  p.set("limit", String(PAGE));
  return p.toString();
}

// The database filters and pages (migration 0030). Each answer carries the
// filters it belongs to; the last one stays on screen while the next loads.
export function ContactsBrowser({ initial }: { initial: ContactSearchResult }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [q, setQ] = useState("");
  const [emailOnly, setEmailOnly] = useState(false);
  const key = JSON.stringify([filter, q, emailOnly]);
  const [shown, setShown] = useState<Shown>(() => ({ ...initial, key }));
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (shown.key === key) return;
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/contacts/search?${paramsFor(filter, q, emailOnly, 0)}`);
        const json = (await res.json()) as ContactSearchResult;
        if (live) setShown({ ...json, key });
      } catch {
        /* keep what is on screen */
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key, filter, q, emailOnly, shown.key]);

  async function showMore() {
    setMore(true);
    try {
      const res = await fetch(`/api/contacts/search?${paramsFor(filter, q, emailOnly, shown.rows.length)}`);
      const json = (await res.json()) as ContactSearchResult;
      setShown((cur) => (cur.key === key ? { ...cur, rows: [...cur.rows, ...json.rows] } : cur));
    } finally {
      setMore(false);
    }
  }

  const loading = shown.key !== key;
  const tabs: { key: Filter; label: string }[] = [
    { key: "ALL", label: "All" },
    ...CATEGORY_ORDER.map((k) => ({ key: k as Filter, label: CATEGORIES[k].label })),
    ...(initial.hasUnclassified ? [{ key: "UN" as Filter, label: CATEGORIES.UN.label }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border bg-card p-1 w-fit">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={cn(
                "px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors",
                filter === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <button
            type="button"
            onClick={() => setEmailOnly(!emailOnly)}
            aria-pressed={emailOnly}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[13px] transition-colors",
              emailOnly ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <Mail className="h-3.5 w-3.5" /> Has email
          </button>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people…"
              className="pl-9"
            />
          </div>
        </div>
      </div>

      <ContactRows rows={shown.rows} matching={shown.total} total={shown.all} loading={loading} more={more} onMore={showMore} />
    </div>
  );
}

function ContactRows({
  rows,
  matching,
  total,
  loading,
  more,
  onMore,
}: {
  rows: ContactRow[];
  matching: number;
  total: number;
  loading: boolean;
  more: boolean;
  onMore: () => void;
}) {
  const filtered = rows;
  return (
    <>

      <div className={cn("rounded-xl border bg-card overflow-hidden transition-opacity", loading && "opacity-60")}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Country</TableHead>
              <TableHead className="text-right">Contact</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell className="text-muted-foreground text-center py-10" colSpan={5}>
                  No contacts match.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/contacts/${c.id}`} className="flex items-center gap-2.5 font-medium hover:text-primary">
                      <PersonAvatar name={c.full_name} size={30} />
                      {c.full_name ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[220px] truncate">
                    {c.job_title ?? "—"}
                  </TableCell>
                  <TableCell>
                    {c.company ? (
                      <Link
                        href={`/companies/${c.company.id}`}
                        className="inline-flex items-center gap-2 hover:text-primary"
                      >
                        <CategoryBadge category={c.company.category} />
                        <span className="truncate max-w-[160px]">{c.company.name}</span>
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.country ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2 text-muted-foreground">
                      {c.has_email ? (
                        <Mail className="h-4 w-4" />
                      ) : c.connectable ? (
                        <span title="Direct email held in the team's master sheet">
                          <Mail className="h-4 w-4 text-[var(--success)]" />
                        </span>
                      ) : null}
                      {c.has_phone ? <Phone className="h-4 w-4" /> : null}
                      {c.has_linkedin ? <Link2 className="h-4 w-4" /> : null}
                      {!c.has_email && !c.connectable && !c.has_phone && !c.has_linkedin ? <span className="text-xs">—</span> : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Showing {filtered.length.toLocaleString("en-US")} of {matching.toLocaleString("en-US")}
          {matching !== total ? ` matching (${total.toLocaleString("en-US")} in all)` : ""}
        </span>
        {rows.length < matching ? (
          <button
            type="button"
            disabled={more || loading}
            onClick={onMore}
            className="rounded-md border bg-card px-3 py-1.5 text-foreground hover:bg-accent disabled:opacity-50"
          >
            {more ? "Loading…" : `Show ${Math.min(PAGE, matching - rows.length)} more`}
          </button>
        ) : null}
      </div>
    </>
  );
}
