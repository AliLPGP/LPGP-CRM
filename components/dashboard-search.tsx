"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, Loader2, Building2, X, Sparkles, Download, Check, Database } from "lucide-react";
import type { SearchCompany, SearchContact } from "@/app/api/search/route";
import { CATEGORIES, CATEGORY_ORDER } from "@/lib/categories";
import type { Category } from "@/lib/types";
import { CategoryBadge } from "@/components/category-badge";
import { CompanyLogo } from "@/components/company-logo";
import { PersonAvatar } from "@/components/person-avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LushaPreview = {
  contactId: string;
  name: string | null;
  jobTitle: string | null;
  companyName: string | null;
  country: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
};

function SourceTag({ source }: { source: "db" | "lusha" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        source === "lusha"
          ? "bg-foreground text-background"
          : "border text-muted-foreground",
      )}
    >
      {source === "lusha" ? <Sparkles className="h-2.5 w-2.5" /> : <Database className="h-2.5 w-2.5" />}
      {source === "lusha" ? "Lusha" : "Database"}
    </span>
  );
}

export function DashboardSearch({
  lushaReady = false,
  adminReady = false,
}: {
  lushaReady?: boolean;
  adminReady?: boolean;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(false);

  // Database (live, debounced)
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<SearchCompany[]>([]);
  const [contacts, setContacts] = useState<SearchContact[]>([]);
  const reqId = useRef(0);

  // Lusha (explicit, to avoid burning credits on every keystroke)
  const [lushaLoading, setLushaLoading] = useState(false);
  const [lushaSearched, setLushaSearched] = useState(false);
  const [lushaContacts, setLushaContacts] = useState<LushaPreview[]>([]);
  const [lushaRequestId, setLushaRequestId] = useState<string | null>(null);
  const [lushaError, setLushaError] = useState<string | null>(null);
  const [book, setBook] = useState<Category>("LP");
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<Set<string>>(new Set());

  useEffect(() => {
    const query = q.trim();
    const id = ++reqId.current;
    const t = setTimeout(
      async () => {
        if (query.length < 2) {
          if (id === reqId.current) {
            setCompanies([]);
            setContacts([]);
            setLoading(false);
          }
          return;
        }
        if (id === reqId.current) setLoading(true);
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
          const data = await res.json();
          if (id !== reqId.current) return;
          setCompanies(data.companies ?? []);
          setContacts(data.contacts ?? []);
        } catch {
          if (id === reqId.current) {
            setCompanies([]);
            setContacts([]);
          }
        } finally {
          if (id === reqId.current) setLoading(false);
        }
      },
      query.length < 2 ? 0 : 200,
    );
    return () => clearTimeout(t);
  }, [q]);

  function onQueryChange(value: string) {
    setQ(value);
    // Reset the Lusha panel whenever the query changes.
    setLushaSearched(false);
    setLushaContacts([]);
    setLushaError(null);
    setImported(new Set());
  }

  async function searchLusha() {
    const query = q.trim();
    if (query.length < 2) return;
    setLushaError(null);
    setLushaLoading(true);
    setLushaSearched(true);
    try {
      const res = await fetch(`/api/search/lusha?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lusha search failed");
      setLushaRequestId(data.requestId ?? null);
      setLushaContacts(data.contacts ?? []);
    } catch (e) {
      setLushaContacts([]);
      setLushaError(e instanceof Error ? e.message : "Lusha search failed");
    } finally {
      setLushaLoading(false);
    }
  }

  async function importOne(contactId: string) {
    setImporting(contactId);
    setLushaError(null);
    try {
      const res = await fetch("/api/lusha/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: book, requestId: lushaRequestId, contactIds: [contactId] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setImported((prev) => new Set(prev).add(contactId));
    } catch (e) {
      setLushaError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(null);
    }
  }

  const hasQuery = q.trim().length >= 2;
  const hasDbResults = companies.length > 0 || contacts.length > 0;

  return (
    <div className="sheen rounded-xl border bg-card p-5 md:p-6">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <span className="eyebrow">Search the database</span>
      </div>
      <div className="relative mt-3">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        {loading ? (
          <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        ) : q ? (
          <button
            onClick={() => onQueryChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
        <Input
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => setActive(true)}
          placeholder="Search firms and people by name, title, email, country…"
          className="h-12 pl-11 pr-10 text-base"
          autoComplete="off"
        />
      </div>

      {active && hasQuery ? (
        <div className="mt-4 space-y-5">
          {/* Database results */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="eyebrow">From your database</p>
              <SourceTag source="db" />
            </div>

            {!hasDbResults && !loading ? (
              <p className="text-sm text-muted-foreground py-2">No matches in your CRM for “{q.trim()}”.</p>
            ) : null}

            {contacts.length > 0 ? (
              <ul className="divide-y rounded-lg border overflow-hidden">
                {contacts.map((c) => (
                  <li key={c.id}>
                    <Link href={`/contacts/${c.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50">
                      <PersonAvatar name={c.full_name} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{c.full_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {[c.job_title, c.company?.name].filter(Boolean).join(" · ") || c.email || "—"}
                        </div>
                      </div>
                      {c.company ? <CategoryBadge category={c.company.category} /> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}

            {companies.length > 0 ? (
              <ul className="divide-y rounded-lg border overflow-hidden mt-2">
                {companies.map((co) => (
                  <li key={co.id}>
                    <Link href={`/companies/${co.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50">
                      <CompanyLogo name={co.name} domain={co.domain} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{co.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {[co.sub_type, co.country].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>
                      <CategoryBadge category={co.category} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* Lusha results */}
          <div className="border-t pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <p className="eyebrow">From Lusha</p>
                <SourceTag source="lusha" />
              </div>
              {lushaReady && lushaSearched && lushaContacts.length > 0 ? (
                <div className="flex items-center gap-1 rounded-lg border bg-background p-0.5">
                  {CATEGORY_ORDER.map((k) => (
                    <button
                      key={k}
                      onClick={() => setBook(k)}
                      title={`Import as ${CATEGORIES[k].name}`}
                      className={cn(
                        "px-2 py-1 text-xs font-medium rounded-md transition-colors",
                        book === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {CATEGORIES[k].label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {!lushaReady ? (
              <p className="text-sm text-muted-foreground py-1">
                Add <code className="font-mono text-xs">LUSHA_API_KEY</code> to search Lusha from here.
              </p>
            ) : !lushaSearched ? (
              <Button variant="outline" size="sm" onClick={searchLusha} disabled={lushaLoading}>
                {lushaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Search Lusha for “{q.trim()}”
              </Button>
            ) : lushaLoading ? (
              <p className="text-sm text-muted-foreground py-1 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching Lusha…
              </p>
            ) : lushaError ? (
              <p className="text-sm text-destructive py-1">{lushaError}</p>
            ) : lushaContacts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-1">No Lusha matches for “{q.trim()}”.</p>
            ) : (
              <ul className="divide-y rounded-lg border overflow-hidden">
                {lushaContacts.map((p) => {
                  const done = imported.has(p.contactId);
                  return (
                    <li key={p.contactId} className="flex items-center gap-3 px-3 py-2.5">
                      <PersonAvatar name={p.name} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{p.name ?? "Unknown"}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {[p.jobTitle, p.companyName, p.country].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>
                      {done ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Check className="h-3.5 w-3.5" /> Imported
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!adminReady || importing === p.contactId}
                          onClick={() => importOne(p.contactId)}
                          title={adminReady ? `Import as ${CATEGORIES[book].label}` : "Set SUPABASE_SERVICE_ROLE_KEY to import"}
                        >
                          {importing === p.contactId ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          Import
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {lushaReady && lushaSearched && lushaContacts.length > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Importing reveals emails &amp; phones and spends Lusha credits. Imported as{" "}
                <span className="font-medium text-foreground">{CATEGORIES[book].name}</span>.
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5" />
          Searches everything in your CRM instantly; Lusha lookups are one click away and clearly labelled.
        </p>
      )}
    </div>
  );
}
