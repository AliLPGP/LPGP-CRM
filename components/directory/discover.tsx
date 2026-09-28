"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bookmark,
  BookmarkPlus,
  ChevronDown,
  Download,
  Loader2,
  Plug,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { deleteSavedSearch, saveSearch } from "@/lib/directory/actions";
import { interpretThesisWithAi } from "@/lib/directory/ai-actions";
import {
  EMPTY_FILTERS,
  filtersFromParams,
  filtersToParams,
  isEmptyQuery,
  matches,
  type DirectoryFilters,
  type SortKey,
} from "@/lib/directory/filters";
import type { PackedIndex } from "@/lib/directory/records";
import { interpret, readingToFilters } from "@/lib/directory/thesis";
import type { SavedSearch } from "@/lib/directory/queries";
import { CATEGORIES } from "@/lib/categories";
import { DashboardSearch } from "@/components/dashboard-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { BulkBar, downloadCsv, type ListOption } from "./bulk-bar";
import { describeFilters, FilterChips } from "./filter-chips";
import { FilterRail } from "./filter-rail";
import { ProviderLeaders } from "./provider-leaders";
import { ResultsTable } from "./results-table";
import { ThesisBar } from "./thesis-bar";
import { useDirectory } from "./use-directory";
import { useResults } from "./use-results";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "complete", label: "Most complete" },
  { key: "relevance", label: "Best match" },
  { key: "similarity", label: "Most similar" },
  { key: "aum", label: "Largest" },
  { key: "employees", label: "Most people" },
  { key: "founded", label: "Newest" },
  { key: "contacts", label: "Most contacts" },
  { key: "name", label: "Name" },
];

function SaveSearchModal({
  open,
  onClose,
  query,
  params,
}: {
  open: boolean;
  onClose: () => void;
  query: string;
  params: string;
}) {
  const [name, setName] = useState(query.slice(0, 80));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Modal open={open} onClose={onClose} size="sm">
      <ModalHeader icon={<BookmarkPlus className="h-4 w-4" />} title="Save this search" description="Saved searches are shared with the team." onClose={onClose} />
      <ModalBody>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. UK private credit, $1bn+" />
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button
          disabled={pending || !name.trim()}
          onClick={() =>
            start(async () => {
              const r = await saveSearch(name, query, params);
              if (!r.ok) {
                setError(r.error ?? "Couldn't save.");
                return;
              }
              router.refresh();
              onClose();
            })
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function SavedMenu({
  saved,
  onPick,
  userId,
  isAdmin,
}: {
  saved: SavedSearch[];
  onPick: (s: SavedSearch) => void;
  userId: string | null;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!saved.length) return null;
  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Bookmark className="h-4 w-4" /> Saved <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      {open ? (
        <>
          <button className="fixed inset-0 z-30 cursor-default" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1.5 w-80 overflow-hidden rounded-xl border bg-popover shadow-[var(--shadow-pop)]">
            <ul className="max-h-80 overflow-y-auto py-1">
              {saved.map((s) => (
                <li key={s.id} className="group flex items-center gap-2 px-3 py-2 hover:bg-accent/60">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      setOpen(false);
                      onPick(s);
                    }}
                  >
                    <span className="block truncate text-sm font-medium">{s.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {s.query ?? "Filters"}
                      {s.owner_name ? ` · ${s.owner_name}` : ""}
                    </span>
                  </button>
                  {isAdmin || s.owner_id === userId ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          await deleteSavedSearch(s.id);
                          router.refresh();
                        })
                      }
                      className="rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                      aria-label={`Delete ${s.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function Discover({
  packed,
  lists,
  saved,
  userId,
  isAdmin,
  lushaReady,
  adminReady,
  aiReady,
}: {
  packed: PackedIndex;
  lists: ListOption[];
  saved: SavedSearch[];
  userId: string | null;
  isAdmin: boolean;
  lushaReady: boolean;
  adminReady: boolean;
  /** ANTHROPIC_API_KEY is set: Claude re-reads each thesis after the rules. */
  aiReady: boolean;
}) {
  const dir = useDirectory(packed);
  const params = useSearchParams();
  const pathname = usePathname();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const q = params.get("q") ?? "";
  const results = useResults(dir, filters);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<{ q: string; notes: string[]; ai?: boolean }>({ q: "", notes: [] });
  const [aiPending, startAi] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [lushaOpen, setLushaOpen] = useState(false);

  function navigate(next: DirectoryFilters, opts: { q?: string | null; push?: boolean } = {}) {
    const sp = filtersToParams(next);
    const text = opts.q === undefined ? q : opts.q;
    if (text) sp.set("q", text);
    const qs = sp.toString();
    const url = `${pathname}${qs ? `?${qs}` : ""}`;
    if (opts.push) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }

  function submitThesis(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      navigate(EMPTY_FILTERS, { q: null, push: true });
      return;
    }
    const { filters: next, notes: n } = interpret(trimmed, dir.vocab);
    setNotes({ q: trimmed, notes: n });
    navigate(next, { q: trimmed, push: true });
    if (!aiReady) return;
    // The rules answered instantly; Claude's reading replaces theirs when it
    // lands, unless the person has moved on to another search by then.
    startAi(async () => {
      const r = await interpretThesisWithAi(trimmed);
      if (new URLSearchParams(window.location.search).get("q") !== trimmed) return;
      if (!r.ok) {
        setNotes({ q: trimmed, notes: [...n, r.error] });
        return;
      }
      const ai = readingToFilters(r.reading, dir.vocab);
      setNotes({ q: trimmed, notes: ai.notes, ai: true });
      navigate(ai.filters, { q: trimmed });
    });
  }

  function applyRuleReading() {
    const { filters: next, notes: n } = interpret(q, dir.vocab);
    setNotes({ q, notes: n });
    navigate(next);
  }

  const chips = describeFilters(filters, dir);
  const signature = filtersToParams(filters).toString();
  const showLeaders = filters.clientTypes.length > 0 || (filters.books.includes("SP") && filters.types.length > 0);

  const relax = useMemo(() => {
    if (results.rows.length || !chips.length) return [];
    return chips
      .map((c) => {
        const f = c.remove(filters);
        const n = dir.records.filter((r) => matches(r, f, dir.ctx)).length;
        return { chip: c, count: n, next: f };
      })
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [results.rows.length, chips, filters, dir]);

  if (!dir.records.length) {
    return (
      <div className="sheen rounded-2xl border bg-card px-6 py-14 text-center">
        <p className="font-semibold">The directory is empty</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Import the Master Directory workbook to load every firm, key contact and Form ADV provider link.
        </p>
        <Button asChild className="mt-4">
          <Link href="/import/directory">Import the Master Directory</Link>
        </Button>
      </div>
    );
  }

  const bookCounts = results.facets.books;
  const total = [...bookCounts.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5">
      {!dir.schemaReady ? (
        <div className="rounded-2xl border border-[var(--warning)]/40 bg-[var(--warning-soft)] px-4 py-3 text-sm">
          Some directory features are off until the directory SQL runs:{" "}
          <code className="font-mono text-xs">supabase/sql-parts/3-directory/</code> parts 1–4, then{" "}
          <Link href="/import/directory" className="font-medium underline underline-offset-2">
            import the workbook
          </Link>
          .
        </div>
      ) : null}

      <ThesisBar key={q} initial={q} onSubmit={submitThesis} pending={aiPending} aiReady={aiReady} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          {results.mode === "similar" && results.seeds.length ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-[var(--brass)]" />
              <span>
                Firms most like <span className="font-semibold">{results.seeds.map((s) => s.name).join(", ")}</span> — by
                profile, type, size, place and shared providers
              </span>
            </div>
          ) : null}
          <FilterChips chips={chips} filters={filters} onChange={(f) => navigate(f)} />
          {aiPending ? (
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Refining the reading with AI…
            </p>
          ) : notes.q === q && notes.notes.length ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {notes.ai ? <Sparkles className="h-3 w-3 text-[var(--brass)]" /> : null}
              <span>{notes.notes.join(" · ")}</span>
              {notes.ai ? (
                <button type="button" onClick={applyRuleReading} className="font-medium text-foreground/80 underline-offset-2 hover:underline">
                  Use the quick reading instead
                </button>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SavedMenu
            saved={saved}
            userId={userId}
            isAdmin={isAdmin}
            onPick={(s) => {
              const sp = new URLSearchParams(s.filters);
              navigate(filtersFromParams(sp), { q: sp.get("q") ?? s.query ?? null, push: true });
            }}
          />
          {!isEmptyQuery(filters) ? (
            <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)} disabled={!userId}>
              <BookmarkPlus className="h-4 w-4" /> Save search
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCsv(results.rows.map((r) => r.record), `lpgp-discover-${results.rows.length}.csv`)}
            disabled={!results.rows.length}
          >
            <Download className="h-4 w-4" /> Export {results.rows.length.toLocaleString("en-US")}
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[272px_minmax(0,1fr)]">
        <aside className={cn("space-y-3 lg:block", railOpen ? "block" : "hidden")}>
          <FilterRail dir={dir} filters={filters} facets={results.facets} onChange={(f) => navigate(f)} />
          <button
            type="button"
            onClick={() => setLushaOpen(!lushaOpen)}
            className="flex w-full items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-left text-sm hover:bg-accent/40"
          >
            <Plug className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1">
              <span className="font-medium">Not in the database?</span>
              <span className="block text-xs text-muted-foreground">Search Lusha for new firms and people</span>
            </span>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", lushaOpen && "rotate-180")} />
          </button>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex flex-wrap rounded-lg border bg-card p-1">
              <button
                type="button"
                onClick={() => navigate({ ...filters, books: [] })}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  filters.books.length === 0 ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                All <span className="ml-1 tabular text-xs opacity-75">{total.toLocaleString("en-US")}</span>
              </button>
              {(["LP", "GP", "SP", "UN"] as const).map((b) => {
                const n = bookCounts.get(b) ?? 0;
                if (b === "UN" && n === 0 && !filters.books.includes("UN")) return null;
                const on = filters.books.length === 1 && filters.books[0] === b;
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => navigate({ ...filters, books: on ? [] : [b] })}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                    title={CATEGORIES[b].name}
                  >
                    {CATEGORIES[b].label}
                    <span className="ml-1 tabular text-xs opacity-75">{n.toLocaleString("en-US")}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setRailOpen(!railOpen)}>
                <SlidersHorizontal className="h-4 w-4" /> Filters
              </Button>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="hidden sm:inline">Sort</span>
                <select
                  value={results.sort}
                  onChange={(e) => navigate({ ...filters, sort: e.target.value as SortKey })}
                  className="h-8 rounded-md border border-input bg-card px-2 text-sm text-foreground outline-none"
                >
                  {SORTS.filter(
                    (s) =>
                      (s.key !== "relevance" || results.mode === "keywords") &&
                      (s.key !== "similarity" || results.mode === "similar"),
                  ).map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {lushaOpen ? (
            <div className="rounded-2xl border bg-card p-4">
              <DashboardSearch lushaReady={lushaReady} adminReady={adminReady} />
            </div>
          ) : null}

          {showLeaders ? <ProviderLeaders dir={dir} filters={filters} /> : null}

          <ResultsTable
            key={signature}
            rows={results.rows}
            sort={results.sort}
            onSort={(k) => navigate({ ...filters, sort: k })}
            query={filters.keywords}
            mode={results.mode}
            selected={selected}
            onToggle={(id) => {
              const next = new Set(selected);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              setSelected(next);
            }}
            onToggleMany={(ids, on) => {
              const next = new Set(selected);
              for (const id of ids) {
                if (on) next.add(id);
                else next.delete(id);
              }
              setSelected(next);
            }}
            onSimilar={(id) => navigate({ ...EMPTY_FILTERS, like: [id] }, { q: null, push: true })}
            empty={
              <div className="space-y-3">
                <p className="font-semibold">No firms match all of that</p>
                {relax.length ? (
                  <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
                    <span className="text-muted-foreground">Try without</span>
                    {relax.map((r) => (
                      <button
                        key={r.chip.key}
                        type="button"
                        onClick={() => navigate(r.next)}
                        className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 hover:border-[var(--brass)]/50"
                      >
                        <X className="h-3 w-3" /> {r.chip.label}
                        <span className="tabular text-xs text-muted-foreground">→ {r.count}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Try fewer words, or clear the filters.</p>
                )}
              </div>
            }
          />
        </section>
      </div>

      {notice ? (
        <div className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl border bg-popover px-4 py-2.5 text-sm shadow-[var(--shadow-pop)]">
          {notice}
          <button type="button" onClick={() => setNotice(null)} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <BulkBar
        selected={selected}
        records={dir.records}
        lists={lists}
        isAdmin={isAdmin}
        signedIn={Boolean(userId)}
        onClear={() => setSelected(new Set())}
        onSimilar={(ids) => navigate({ ...EMPTY_FILTERS, like: ids }, { q: null, push: true })}
        onNotice={setNotice}
      />

      {saveOpen ? (
        <SaveSearchModal open onClose={() => setSaveOpen(false)} query={q} params={`${signature}${q ? `&q=${encodeURIComponent(q)}` : ""}`} />
      ) : null}
    </div>
  );
}
