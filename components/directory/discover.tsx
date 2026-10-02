"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Bookmark,
  BookmarkPlus,
  ChevronDown,
  Download,
  LayoutGrid,
  Layers,
  ListChecks,
  Loader2,
  Map as MapIcon,
  Plug,
  Rows3,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
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
import { summarize } from "@/lib/directory/insights";
import type { PackedIndex } from "@/lib/directory/records";
import type { WorldGeometry } from "@/lib/directory/world-map";
import { interpret, readingToFilters } from "@/lib/directory/thesis";
import type { SavedSearch } from "@/lib/directory/queries";
import { CATEGORIES } from "@/lib/categories";
import { DashboardSearch } from "@/components/dashboard-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { cn, formatUsd } from "@/lib/utils";
import { BulkBar, downloadCsv, type ListOption } from "./bulk-bar";
import { describeFilters, FilterChips } from "./filter-chips";
import { FilterRail } from "./filter-rail";
import { DiscoverOverview, type OverviewCommitment } from "./overview";
import { ProviderLeaders } from "./provider-leaders";
import { QuickLook } from "./quick-look";
import { ResultCards } from "./result-cards";
import { ResultInsights } from "./result-insights";
import { ResultsTable } from "./results-table";
import { ThesisBar } from "./thesis-bar";
import { compact, Figure } from "./viz";
import { useDirectory } from "./use-directory";
import { useResults } from "./use-results";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "complete", label: "Most complete" },
  { key: "relevance", label: "Best match" },
  { key: "similarity", label: "Most similar" },
  { key: "aum", label: "Largest" },
  { key: "employees", label: "Most people" },
  { key: "founded", label: "Longest established" },
  { key: "newest", label: "Newly added" },
  { key: "updated", label: "Recently updated" },
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

type View = "table" | "cards";

export function Discover({
  packed,
  lists,
  saved,
  userId,
  isAdmin,
  lushaReady,
  adminReady,
  aiReady,
  geometry,
  commitments,
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
  geometry: WorldGeometry | null;
  commitments: OverviewCommitment[];
}) {
  const dir = useDirectory(packed);
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const q = params.get("q") ?? "";
  const viewParam = params.get("view");
  const view: View = viewParam === "cards" ? "cards" : "table";
  const results = useResults(dir, filters);
  const everything = useMemo(() => summarize(dir.records), [dir]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<{ q: string; notes: string[]; ai?: boolean }>({ q: "", notes: [] });
  const [aiPending, startAi] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [lushaOpen, setLushaOpen] = useState(false);
  const [peek, setPeek] = useState<string | null>(null);

  // Home is the dashboard: no search, no filters, and no view asked for.
  const home = isEmptyQuery(filters) && !q && !viewParam;

  function navigate(next: DirectoryFilters, opts: { q?: string | null; push?: boolean; view?: string | null } = {}) {
    const sp = filtersToParams(next);
    const text = opts.q === undefined ? q : opts.q;
    if (text) sp.set("q", text);
    const v = opts.view === undefined ? viewParam : opts.view;
    if (v) sp.set("view", v);
    const qs = sp.toString();
    const url = `${pathname}${qs ? `?${qs}` : ""}`;
    if (opts.push) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function submitThesis(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      navigate(EMPTY_FILTERS, { q: null, push: true, view: null });
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

  const peekRecord = peek ? (dir.byId.get(peek) ?? null) : null;

  const actions = (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button asChild variant="outline" size="sm">
        <Link href="/database/market">
          <MapIcon className="h-4 w-4" /> Market map
        </Link>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link href="/funds">
          <Layers className="h-4 w-4" /> Funds
        </Link>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link href="/database/lists">
          <ListChecks className="h-4 w-4" /> Lists
        </Link>
      </Button>
      {isAdmin ? (
        <Button asChild variant="outline" size="sm">
          <Link href="/import/directory">
            <Upload className="h-4 w-4" /> Import
          </Link>
        </Button>
      ) : null}
    </div>
  );

  if (!dir.records.length) {
    return (
      <div className="stand rounded-3xl px-6 py-14 text-center">
        <div className="stand-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative">
          <p className="wordmark text-[11px] text-[var(--brass)]">LPGP Intelligence</p>
          <p className="display mt-3 text-2xl">The directory is empty</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Import the Master Directory workbook to load every firm, key contact, Form ADV provider link and named fund.
          </p>
          {isAdmin ? (
            <Button asChild className="mt-5">
              <Link href="/import/directory">Import the Master Directory</Link>
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const bookCounts = results.facets.books;
  const total = [...bookCounts.values()].reduce((a, b) => a + b, 0);
  const regulatory = everything.raum;
  const advThrough = dir.advThrough
    ? new Date(dir.advThrough).toLocaleDateString("en-GB", { month: "short", year: "numeric" })
    : null;

  return (
    <div className="space-y-5">
      {/* The stand: search first, the scale of the book right under it. */}
      <section className={cn("stand rounded-[6px]", home ? "px-5 pb-5 pt-5 md:px-7 md:pb-6 md:pt-6" : "px-4 py-3 md:px-5")}>
        <div className="stand-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              {home ? (
                <>
                  <p className="wordmark text-[10px] text-[var(--brass)]">Intelligence desk</p>
                  <h1 className="display mt-2 max-w-3xl text-[22px] leading-[1.1] md:text-[28px]">
                    Every LP, GP and provider in your market, searchable in a sentence.
                  </h1>
                  <p className="mt-2 max-w-2xl text-[12.5px] text-muted-foreground">
                    {everything.total.toLocaleString("en-US")} firms, {everything.people.toLocaleString("en-US")} named
                    decision-makers, {everything.funds.toLocaleString("en-US")} funds and{" "}
                    {Math.round(everything.providerLinks).toLocaleString("en-US")} Form ADV service-provider links
                    {advThrough ? ` — filings through ${advThrough}` : ""}.
                  </p>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate(EMPTY_FILTERS, { q: null, push: true, view: null })}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Intelligence overview
                </button>
              )}
            </div>
            {actions}
          </div>

          <ThesisBar key={q} initial={q} onSubmit={submitThesis} pending={aiPending} aiReady={aiReady} examples={home} />

          {home ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-[var(--border)] pt-4 sm:grid-cols-3 lg:grid-cols-6">
              <Figure label="Firms" value={compact(everything.total)} sub="across four books" onClick={() => navigate(EMPTY_FILTERS, { push: true, view: "table" })} />
              <Figure label="General partners" value={compact(everything.books.GP)} sub={`${everything.filers.toLocaleString("en-US")} with Form ADV providers`} onClick={() => navigate({ ...EMPTY_FILTERS, books: ["GP"] }, { push: true })} />
              <Figure label="Limited partners" value={compact(everything.books.LP)} sub="pensions, SWFs, insurers, E&Fs" onClick={() => navigate({ ...EMPTY_FILTERS, books: ["LP"] }, { push: true })} />
              <Figure label="Decision-makers" value={compact(everything.people)} sub={`${everything.connectable.toLocaleString("en-US")} with a direct email`} onClick={() => navigate({ ...EMPTY_FILTERS, hasContacts: true }, { push: true })} />
              <Figure label="Funds on file" value={compact(everything.funds)} sub="named on Form ADV Schedule D" />
              <Figure
                label="Regulatory AUM"
                value={regulatory.firms ? formatUsd(regulatory.sum) : "—"}
                sub={regulatory.firms ? `Form ADV, ${regulatory.firms.toLocaleString("en-US")} advisers · brand totals once` : "no Form ADV sizes yet"}
              />
            </div>
          ) : null}
        </div>
      </section>

      {!dir.schemaReady ? (
        <div className="rounded-2xl border border-[var(--warning)]/40 bg-[var(--warning-soft)] px-4 py-3 text-sm">
          Some directory features are off until the directory SQL runs — see the setup steps above, then{" "}
          <Link href="/import/directory" className="font-medium underline underline-offset-2">
            import the workbook
          </Link>
          .
        </div>
      ) : null}

      {home ? (
        <DiscoverOverview
          dir={dir}
          insights={everything}
          geometry={geometry}
          commitments={commitments}
          lists={lists}
          saved={saved}
          onApply={(f) => navigate(f, { q: null, push: true })}
          onQuickLook={setPeek}
        />
      ) : (
        <>
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
                  <div className="inline-flex rounded-lg border bg-card p-0.5" role="group" aria-label="Layout">
                    {(
                      [
                        ["table", Rows3, "Table"],
                        ["cards", LayoutGrid, "Cards"],
                      ] as const
                    ).map(([v, Icon, label]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => navigate(filters, { view: v === "table" && !isEmptyQuery(filters) ? null : v })}
                        className={cn(
                          "grid h-7 w-8 place-items-center rounded-md transition-colors",
                          view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                        aria-pressed={view === v}
                        title={label}
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    ))}
                  </div>
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

              <ResultInsights dir={dir} rows={results.rows} filters={filters} onChange={(f) => navigate(f)} />

              {showLeaders ? <ProviderLeaders dir={dir} filters={filters} /> : null}

              {results.rows.length === 0 ? (
                <div className="sheen rounded-2xl border bg-card px-6 py-14 text-center">
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
                </div>
              ) : view === "cards" ? (
                <ResultCards
                  key={signature}
                  dir={dir}
                  rows={results.rows}
                  query={filters.keywords}
                  mode={results.mode}
                  selected={selected}
                  onToggle={toggle}
                  onQuickLook={setPeek}
                  onSimilar={(id) => navigate({ ...EMPTY_FILTERS, like: [id] }, { q: null, push: true })}
                />
              ) : (
                <ResultsTable
                  key={signature}
                  dir={dir}
                  rows={results.rows}
                  sort={results.sort}
                  onSort={(k) => navigate({ ...filters, sort: k })}
                  query={filters.keywords}
                  mode={results.mode}
                  selected={selected}
                  onToggle={toggle}
                  onToggleMany={(ids, on) => {
                    const next = new Set(selected);
                    for (const id of ids) {
                      if (on) next.add(id);
                      else next.delete(id);
                    }
                    setSelected(next);
                  }}
                  onQuickLook={setPeek}
                  onSimilar={(id) => navigate({ ...EMPTY_FILTERS, like: [id] }, { q: null, push: true })}
                />
              )}
            </section>
          </div>
        </>
      )}

      <QuickLook
        dir={dir}
        record={peekRecord}
        selected={peek ? selected.has(peek) : false}
        onClose={() => setPeek(null)}
        onToggle={toggle}
        onOpen={(id) => router.push(`/companies/${id}`)}
        onSimilar={(id) => {
          setPeek(null);
          navigate({ ...EMPTY_FILTERS, like: [id] }, { q: null, push: true });
        }}
      />

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
