"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Trash2, CheckSquare, Loader2, X } from "lucide-react";
import type { Company, Category } from "@/lib/types";
import { CATEGORIES, CATEGORY_ORDER } from "@/lib/categories";
import { deleteCompanies } from "@/lib/actions";
import { CategoryBadge } from "@/components/category-badge";
import { CompanyLogo } from "@/components/company-logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Filter = Category | "ALL";

export function CompaniesBrowser({
  companies,
  initialFilter = "ALL",
}: {
  companies: Company[];
  initialFilter?: Filter;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [q, setQ] = useState("");

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { ALL: companies.length, LP: 0, GP: 0, SP: 0, UN: 0 };
    for (const co of companies) c[co.category] += 1;
    return c;
  }, [companies]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return companies.filter((co) => {
      if (filter !== "ALL" && co.category !== filter) return false;
      if (!needle) return true;
      return (
        co.name.toLowerCase().includes(needle) ||
        (co.sub_type ?? "").toLowerCase().includes(needle) ||
        (co.country ?? "").toLowerCase().includes(needle)
      );
    });
  }, [companies, filter, q]);

  const tabs: { key: Filter; label: string }[] = [
    { key: "ALL", label: "All" },
    ...CATEGORY_ORDER.map((k) => ({ key: k as Filter, label: CATEGORIES[k].label })),
  ];

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
    setConfirming(false);
    setError(null);
  }

  function selectAllVisible() {
    setSelected(new Set(filtered.map((c) => c.id)));
  }

  function runDelete() {
    setError(null);
    const ids = Array.from(selected);
    start(async () => {
      const res = await deleteCompanies(ids);
      if (res.ok) {
        exitSelect();
        router.refresh();
      } else {
        setError(res.error ?? "Could not delete");
        setConfirming(false);
      }
    });
  }

  function card(co: Company) {
    return (
      <>
        <CompanyLogo name={co.name} domain={co.domain} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="font-semibold truncate">{co.name}</span>
            <CategoryBadge category={co.category} />
          </div>
          <p className="text-sm text-muted-foreground truncate">
            {co.sub_type ?? CATEGORIES[co.category].name}
          </p>
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {[co.city, co.country].filter(Boolean).join(", ") || co.hq_location || "—"}
          </p>
        </div>
      </>
    );
  }

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
              <span className="ml-1.5 tabular text-xs opacity-70">{counts[t.key]}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search companies…"
              className="pl-9"
            />
          </div>
          {selectMode ? (
            <Button variant="ghost" size="sm" onClick={exitSelect}>
              <X className="h-4 w-4" /> Cancel
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setSelectMode(true)}>
              <CheckSquare className="h-4 w-4" /> Select
            </Button>
          )}
        </div>
      </div>

      {/* Selection action bar */}
      {selectMode ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-secondary px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <button onClick={selectAllVisible} className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
            Select all {filtered.length}
          </button>
          {selected.size > 0 ? (
            <button onClick={() => setSelected(new Set())} className="text-muted-foreground hover:text-foreground">
              Clear
            </button>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            {error ? <span className="text-xs text-destructive">{error}</span> : null}
            {confirming ? (
              <>
                <span className="text-muted-foreground">Delete {selected.size}? This can&apos;t be undone.</span>
                <Button variant="destructive" size="sm" onClick={runDelete} disabled={pending}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Confirm
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={selected.size === 0}
                onClick={() => setConfirming(true)}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" /> Delete selected
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center text-sm text-muted-foreground">
          No companies match. Try the Import tab to pull leads from Lusha.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((co) => {
            const isSelected = selected.has(co.id);
            if (selectMode) {
              return (
                <button
                  key={co.id}
                  type="button"
                  onClick={() => toggle(co.id)}
                  className={cn(
                    "text-left rounded-xl border bg-card p-4 flex gap-3 transition-colors",
                    isSelected ? "ring-2 ring-primary border-primary bg-accent" : "hover:bg-muted/40",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    readOnly
                    className="mt-1 h-4 w-4 accent-[var(--primary)] shrink-0"
                  />
                  <div className="flex gap-3 min-w-0 flex-1">{card(co)}</div>
                </button>
              );
            }
            return (
              <Link key={co.id} href={`/companies/${co.id}`} className="lift rounded-xl border bg-card p-4 flex gap-3">
                {card(co)}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
