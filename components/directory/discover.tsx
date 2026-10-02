"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bookmark, BookmarkPlus, Download, LayoutGrid, Loader2, Rows3, Sparkles, Trash2, Upload, X } from "lucide-react";
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
import type { DirectoryOverview } from "@/lib/directory/overview";
import type { WorldGeometry } from "@/lib/directory/world-map";
import { interpret, readingToFilters } from "@/lib/directory/thesis";
import type { SavedSearch } from "@/lib/directory/queries";
import { DashboardSearch } from "@/components/dashboard-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { cn, formatUsd } from "@/lib/utils";
import { BulkBar, downloadCsv, type ListOption } from "./bulk-bar";
import { CardsSkeleton, FacetBones, LedgerSkeleton, StripSkeleton } from "./discover-skeleton";
import { describeFilters, FilterChips } from "./filter-chips";
import { FacetBar } from "./filter-rail";
import { DiscoverOverview, type OverviewCommitment } from "./overview";
import { ProviderLeaders } from "./provider-leaders";
import { QuickLook } from "./quick-look";
import { ResultCards } from "./result-cards";
import { ResultInsights } from "./result-insights";
import { ColumnsButton, ResultsTable } from "./results-table";
import { ThesisBar } from "./thesis-bar";
import { compact, Figure } from "./viz";
import { EMPTY_DIRECTORY, reloadDirectory, useDirectoryIndex } from "./use-directory";
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

/** A toolbar button: the facet buttons' own shape, so the row reads as one. */
const TOOL = "inline-flex h-8 items-center gap-1.5 rounded-[4px] border bg-card px-2.5 text-[12.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50";

/** The one "show more" button style, used here for the relax-a-filter offers. */
const MORE = "rounded-[4px] border bg-card px-2.5 py-1 text-[12px] hover:bg-accent";

/** A menu's open panel: the header's own fade-and-rise, off under reduced motion. */
const POP = "animate-[topnav-in_160ms_ease-out] motion-reduce:animate-none";

const n = (v: number) => v.toLocaleString("en-US");

function SaveSearchModal({ open, onClose, query, params }: { open: boolean; onClose: () => void; query: string; params: string }) {
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

function SavedMenu({ saved, onPick, userId, isAdmin }: { saved: SavedSearch[]; onPick: (s: SavedSearch) => void; userId: string | null; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!saved.length) return null;
  return (
    <div className="relative">
      <button type="button" className={TOOL} onClick={() => setOpen(!open)} aria-expanded={open} title="Saved searches">
        <Bookmark className="h-3.5 w-3.5" /> Saved
      </button>
      {open ? (
        <>
          <button className="fixed inset-0 z-30 cursor-default" aria-label="Close" onClick={() => setOpen(false)} />
          <div className={cn(POP, "absolute right-0 top-[calc(100%+4px)] z-40 w-80 overflow-hidden rounded-[4px] border bg-popover text-popover-foreground shadow-[var(--shadow-pop)]")}>
            <ul className="max-h-80 overflow-y-auto py-1">
              {saved.map((s) => (
                <li key={s.id} className="group flex items-center gap-2 px-3 py-1.5 hover:bg-accent">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      setOpen(false);
                      onPick(s);
                    }}
                  >
                    <span className="block truncate text-[12.5px] font-medium">{s.name}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">
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
                      className="rounded-[3px] p-1 text-muted-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
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

/** What the ledger says of itself while the index is on its way. */
function loadingLabel(phase: string, total: number): string {
  const firms = total ? `${n(total)} firms` : "the directory";
  if (phase === "parsing" || phase === "indexing") return `Indexing ${firms} for search…`;
  return `Loading ${firms}…`;
}

/**
 * Discover. The page arrives with the server's overview (the stand's figures,
 * the home's panels) and the version of the directory to fetch; the index
 * itself is pulled from /api/directory/index into a browser-side cache
 * (use-directory.ts) and every search, facet count, lookalike and quick look
 * runs over it here. Until it lands, the results view shows its bones.
 */
export function Discover({
  overview,
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
  overview: DirectoryOverview;
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
  const load = useDirectoryIndex(overview.version);
  // Everything downstream computes against the empty directory until the
  // real one is in: the same code paths, no results, and no re-fetch later.
  const ready = load.dir != null;
  const dir = load.dir ?? EMPTY_DIRECTORY;
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const q = params.get("q") ?? "";
  const viewParam = params.get("view");
  const view: View = viewParam === "cards" ? "cards" : "table";
  const results = useResults(dir, filters);
  const everything = overview.insights;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<{ q: string; notes: string[]; ai?: boolean }>({ q: "", notes: [] });
  const [aiPending, startAi] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
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
    // Before the index lands the vocabulary has no brand, city or firm
    // names, but every other rule (types, books, places, sizes) still reads.
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

  /** Everything off, the thesis too: home when no view was asked for, else the whole book. */
  function clearAll() {
    navigate(EMPTY_FILTERS, { q: null, push: true });
  }

  const chips = describeFilters(filters, dir);
  const signature = filtersToParams(filters).toString();
  const showLeaders = filters.clientTypes.length > 0 || (filters.books.includes("SP") && filters.types.length > 0);

  // With nothing matching, which one filter costs the most results: the
  // empty state offers to drop it, with the count that would come back.
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

  // The server counted the firms; an empty directory is known before the fetch.
  const empty = ready ? dir.records.length === 0 : everything.total === 0;
  if (empty) {
    return (
      <div className="stand rounded-[4px] px-6 py-14 text-center">
        <div className="stand-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative">
          <p className="wordmark text-[11px] text-[var(--brass)]">LPGP Intelligence</p>
          <p className="display mt-3 text-2xl">The directory is empty</p>
          <p className="mx-auto mt-2 max-w-md text-[12.5px] text-muted-foreground">
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

  const regulatory = everything.raum;
  const advThrough = overview.advThrough ? new Date(overview.advThrough).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : null;
  const sorts = SORTS.filter((s) => (s.key !== "relevance" || results.mode === "keywords") && (s.key !== "similarity" || results.mode === "similar"));
  const loading = loadingLabel(load.phase, everything.total);

  return (
    <div className="space-y-4" data-index-phase={load.phase}>
      {home ? (
        // The stand: the one black panel, for the home only — the search
        // first, the scale of the book right under it.
        <section className="stand rounded-[4px] px-5 pb-5 pt-5 md:px-7 md:pb-6 md:pt-6">
          <div className="stand-grid pointer-events-none absolute inset-0" aria-hidden />
          <div className="relative space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="wordmark text-[10px] text-[var(--brass)]">Intelligence desk</p>
                <h1 className="display mt-2 max-w-3xl text-[22px] leading-[1.1] md:text-[28px]">Every LP, GP and provider in your market, searchable in a sentence.</h1>
                <p className="mt-2 max-w-2xl text-[12.5px] text-muted-foreground">
                  {n(everything.total)} firms, {n(everything.people)} named decision-makers, {n(everything.funds)} funds and {n(Math.round(everything.providerLinks))} Form ADV
                  service-provider links{advThrough ? ` — filings through ${advThrough}` : ""}.
                </p>
              </div>
              {isAdmin ? (
                <Link href="/import/directory" className={TOOL}>
                  <Upload className="h-3.5 w-3.5" /> Import
                </Link>
              ) : null}
            </div>

            <ThesisBar key={q} initial={q} onSubmit={submitThesis} pending={aiPending} aiReady={aiReady} examples />

            <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-[var(--border)] pt-4 sm:grid-cols-3 lg:grid-cols-6">
              <Figure label="Firms" value={compact(everything.total)} sub="across four books" onClick={() => navigate(EMPTY_FILTERS, { push: true, view: "table" })} />
              <Figure label="General partners" value={compact(everything.books.GP)} sub={`${n(everything.filers)} with Form ADV providers`} onClick={() => navigate({ ...EMPTY_FILTERS, books: ["GP"] }, { push: true })} />
              <Figure label="Limited partners" value={compact(everything.books.LP)} sub="pensions, SWFs, insurers, E&Fs" onClick={() => navigate({ ...EMPTY_FILTERS, books: ["LP"] }, { push: true })} />
              <Figure label="Decision-makers" value={compact(everything.people)} sub={`${n(everything.connectable)} with a direct email`} onClick={() => navigate({ ...EMPTY_FILTERS, hasContacts: true }, { push: true })} />
              <Figure label="Funds on file" value={compact(everything.funds)} sub="named on Form ADV Schedule D" />
              <Figure
                label="Regulatory AUM"
                value={regulatory.firms ? formatUsd(regulatory.sum) : "—"}
                sub={regulatory.firms ? `Form ADV, ${n(regulatory.firms)} advisers · brand totals once` : "no Form ADV sizes yet"}
              />
            </div>
          </div>
        </section>
      ) : null}

      {!overview.schemaReady ? (
        <div className="rounded-[4px] border border-[var(--warning)]/40 bg-[var(--warning-soft)] px-3 py-2 text-[12.5px]">
          Some directory features are off until the directory SQL runs — see the setup steps above, then{" "}
          <Link href="/import/directory" className="font-medium underline underline-offset-2">
            import the workbook
          </Link>
          .
        </div>
      ) : null}

      {load.phase === "failed" ? (
        <div className="rounded-[4px] border border-[var(--warning)]/40 bg-[var(--warning-soft)] px-3 py-2 text-[12.5px]">
          The directory index could not be loaded ({load.error}).{" "}
          <button type="button" onClick={() => reloadDirectory(overview.version)} className="font-medium underline underline-offset-2">
            Try again
          </button>
        </div>
      ) : null}

      {home ? (
        <DiscoverOverview
          overview={overview}
          geometry={geometry}
          commitments={commitments}
          lists={lists}
          saved={saved}
          onApply={(f) => navigate(f, { q: null, push: true })}
          onQuickLook={setPeek}
        />
      ) : (
        <>
          {ready ? <ResultInsights rows={results.rows} /> : <StripSkeleton />}

          {/* The toolbar every list screen shares: search · facets · sort · count · layout, columns, saved, export. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <ThesisBar key={q} compact initial={q} onSubmit={submitThesis} pending={aiPending} aiReady={aiReady} />
            {ready ? <FacetBar dir={dir} filters={filters} facets={results.facets} onChange={(f) => navigate(f)} /> : <FacetBones />}
            <select
              value={results.sort}
              onChange={(e) => navigate({ ...filters, sort: e.target.value as SortKey })}
              className="h-8 rounded-[4px] border border-input bg-card px-2 text-[12.5px] text-foreground outline-none"
              aria-label="Sort"
            >
              {sorts.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <span className="px-1 text-[12.5px]">
              {ready ? (
                <>
                  <span className="figure">{n(results.rows.length)}</span> <span className="text-muted-foreground">firms</span>
                </>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> {loading}
                </span>
              )}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <div className="inline-flex h-8 overflow-hidden rounded-[4px] border bg-card" role="group" aria-label="Layout">
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
                    className={cn("grid w-8 place-items-center transition-colors", view === v ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
                    aria-pressed={view === v}
                    title={label}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
              {view === "table" ? <ColumnsButton mode={results.mode} /> : null}
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
                <button type="button" className={TOOL} onClick={() => setSaveOpen(true)} disabled={!userId} title="Save this search for the team">
                  <BookmarkPlus className="h-3.5 w-3.5" /> Save
                </button>
              ) : null}
              <button type="button" className={TOOL} onClick={() => downloadCsv(results.rows.map((r) => r.record), `lpgp-discover-${results.rows.length}.csv`)} disabled={!results.rows.length}>
                <Download className="h-3.5 w-3.5" /> Export
              </button>
            </div>
          </div>

          <FilterChips chips={chips} filters={filters} onChange={(f) => navigate(f)} onClearAll={clearAll} />

          {results.mode === "similar" && results.seeds.length ? (
            <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-[var(--brass)]" />
              Firms most like <span className="font-medium text-foreground">{results.seeds.map((s) => s.name).join(", ")}</span> — by profile, type, size, place and shared providers
            </p>
          ) : null}
          {aiPending ? (
            <p className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Refining the reading with AI…
            </p>
          ) : notes.q === q && notes.notes.length ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
              {notes.ai ? <Sparkles className="h-3 w-3 text-[var(--brass)]" /> : null}
              <span>{notes.notes.join(" · ")}</span>
              {notes.ai ? (
                <button type="button" onClick={applyRuleReading} className="font-medium text-foreground/80 underline-offset-2 hover:underline">
                  Use the quick reading instead
                </button>
              ) : null}
            </p>
          ) : null}

          {ready && showLeaders ? <ProviderLeaders dir={dir} filters={filters} /> : null}

          {!ready ? (
            view === "cards" ? (
              <CardsSkeleton />
            ) : (
              <LedgerSkeleton label={loading} />
            )
          ) : results.rows.length === 0 ? (
            <div className="sheen rounded-[4px] border bg-card px-4 py-8 text-center">
              <p className="text-[13px]">
                No firm in the directory matches all of that
                {relax.length ? " — the nearest cut is one filter away." : chips.length ? "." : " — try fewer words."}
              </p>
              {relax.length ? (
                <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                  {relax.map((r) => (
                    <button key={r.chip.key} type="button" onClick={() => navigate(r.next)} className={cn(MORE, "inline-flex items-center gap-1.5")}>
                      <X className="h-3 w-3 text-muted-foreground" />
                      Without {r.chip.group.toLowerCase()} {r.chip.label}
                      <span className="figure text-muted-foreground">→ {n(r.count)}</span>
                    </button>
                  ))}
                </div>
              ) : chips.length ? (
                <button type="button" onClick={clearAll} className={cn(MORE, "mt-3")}>
                  Clear the filters
                </button>
              ) : null}
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

          {/* A firm the directory lacks: Lusha, from the same screen. */}
          <div className="text-[12px] text-muted-foreground">
            Not in the database?{" "}
            <button type="button" onClick={() => setLushaOpen(!lushaOpen)} className="font-medium text-foreground/80 underline-offset-2 hover:underline" aria-expanded={lushaOpen}>
              {lushaOpen ? "Hide the Lusha search" : "Search Lusha for new firms and people"}
            </button>
          </div>
          {lushaOpen ? (
            <div className={cn(POP, "rounded-[4px] border bg-card p-3")}>
              <DashboardSearch lushaReady={lushaReady} adminReady={adminReady} />
            </div>
          ) : null}
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
        <div className={cn(POP, "fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-[4px] border bg-popover px-3 py-2 text-[12.5px] shadow-[var(--shadow-pop)]")}>
          {notice}
          <button type="button" onClick={() => setNotice(null)} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
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

      {saveOpen ? <SaveSearchModal open onClose={() => setSaveOpen(false)} query={q} params={`${signature}${q ? `&q=${encodeURIComponent(q)}` : ""}`} /> : null}
    </div>
  );
}
