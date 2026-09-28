"use client";

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowUpRight, Check, Globe, Mail, MapPin, Sparkles, Users, X } from "lucide-react";
import { CategoryBadge } from "@/components/category-badge";
import { CompanyLogo } from "@/components/company-logo";
import { Button } from "@/components/ui/button";
import { brandDomain } from "@/lib/directory/brand-domains";
import { headcountLabel, sizeLabel, sizeTitle } from "@/lib/directory/format";
import { PROVIDER_ROLES, ROLE_PLURAL } from "@/lib/directory/providers";
import { locationLabel, providerPairs, type DirectoryRecord } from "@/lib/directory/records";
import { findSimilar } from "@/lib/directory/similar";
import { cn } from "@/lib/utils";
import type { Directory } from "./use-directory";

function Stat({ label, value, title }: { label: string; value: React.ReactNode; title?: string }) {
  return (
    <div className="min-w-0 rounded-xl border bg-background/50 px-3 py-2.5" title={title}>
      <p className="eyebrow text-[10px]">{label}</p>
      <p className="figure mt-1 truncate text-lg leading-tight">{value}</p>
    </div>
  );
}

/**
 * A firm at a glance, slid in over the results: enough to decide whether to
 * open the full profile, shortlist it, or look for more like it.
 */
export function QuickLook({
  dir,
  record,
  selected,
  onClose,
  onToggle,
  onSimilar,
  onOpen,
}: {
  dir: Directory;
  record: DirectoryRecord | null;
  selected: boolean;
  onClose: () => void;
  onToggle: (id: string) => void;
  onSimilar: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  useEffect(() => {
    if (!record) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [record, onClose]);

  const similar = useMemo(
    () => (record ? findSimilar([record], dir.records, dir.brands, dir.search, 5) : []),
    [record, dir],
  );

  const byRole = useMemo(() => {
    if (!record) return [];
    return PROVIDER_ROLES.map((role) => ({
      role,
      brands: [...new Set(providerPairs(record).filter((p) => p.role === role).map((p) => p.brand))].map(
        (i) => dir.brands[i],
      ),
    })).filter((g) => g.brands.length);
  }, [record, dir]);

  if (!record || typeof document === "undefined") return null;
  const r = record;
  const place = locationLabel(r);

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="modal-overlay absolute inset-0 bg-black/35 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={r.name}
        className="quick-look relative flex h-full w-full max-w-[520px] flex-col overflow-hidden border-l bg-card shadow-[var(--shadow-pop)]"
      >
        <div className="stand px-5 pb-5 pt-4">
          <div className="stand-grid pointer-events-none absolute inset-0" aria-hidden />
          <div className="relative flex items-center justify-between">
            <span className="wordmark text-[10.5px] text-[var(--brass)]">Quick look</span>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="relative mt-3 flex gap-4">
            <CompanyLogo name={r.name} domain={r.domain} size={60} />
            <div className="min-w-0">
              <h2 className="display text-xl leading-tight">{r.name}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <CategoryBadge category={r.category} />
                {r.subType ? <span className="rounded-md border px-2 py-0.5">{r.subType}</span> : null}
                {r.adv ? (
                  <span className="rounded-md border px-2 py-0.5 text-muted-foreground">
                    {r.adv === "ERA" ? "Exempt reporting adviser" : "SEC-registered adviser"}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {place ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {place}
                  </span>
                ) : null}
                {r.domain ? (
                  <a href={`https://${r.domain}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                    <Globe className="h-3 w-3" /> {r.domain}
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Size" value={sizeLabel(r)} title={sizeTitle(r)} />
            <Stat label="Team" value={headcountLabel(r.employees)} />
            <Stat label="Founded" value={r.founded ?? "—"} />
            <Stat label={r.category === "SP" ? "ADV clients" : "Funds"} value={r.category === "SP" ? r.clientCount || "—" : r.funds || r.privateFunds || "—"} title={r.category === "SP" ? "Managers naming this firm on Form ADV" : "Funds on file, or private funds reported on Form ADV"} />
            <Stat label="People" value={r.contacts || "—"} />
            <Stat label="Providers" value={r.providers.length ? new Set(providerPairs(r).map((p) => p.brand)).size : "—"} />
            {r.category === "GP" ? (
              <>
                <Stat label="Operating partners" value={r.operators || "—"} />
                <Stat label="Portfolio cos." value={r.portcos || "—"} />
              </>
            ) : null}
          </div>

          {r.description || r.lines ? (
            <p className="text-[13.5px] leading-relaxed text-foreground/90">{(r.description ?? r.lines)!.slice(0, 520)}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No overview on file yet.</p>
          )}

          {r.contacts ? (
            <div className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm">
              {r.connectable ? <Mail className="h-4 w-4 text-[var(--success)]" /> : <Users className="h-4 w-4 text-muted-foreground" />}
              <span>
                <span className="font-medium">{r.contacts} key contact{r.contacts === 1 ? "" : "s"}</span>
                {r.connectable ? <span className="text-muted-foreground"> · {r.connectable} with a direct email</span> : null}
              </span>
            </div>
          ) : null}

          {byRole.length ? (
            <div>
              <p className="eyebrow">Service providers · Form ADV</p>
              <div className="mt-2 space-y-2">
                {byRole.map((g) => (
                  <div key={g.role} className="flex gap-3">
                    <span className="w-28 shrink-0 pt-1 text-xs text-muted-foreground">{ROLE_PLURAL[g.role]}</span>
                    <div className="flex min-w-0 flex-wrap gap-1.5">
                      {g.brands.slice(0, 6).map((b) => (
                        <Link
                          key={b.key}
                          href={`/database/providers/${b.key}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border bg-background/60 py-0.5 pl-0.5 pr-2 text-xs hover:border-[var(--brass)]/50"
                        >
                          <CompanyLogo name={b.name} domain={brandDomain(b.key, b.companyId ? dir.byId.get(b.companyId)?.domain : null)} size={20} />
                          {b.name}
                        </Link>
                      ))}
                      {g.brands.length > 6 ? <span className="py-1 text-xs text-muted-foreground">+{g.brands.length - 6}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {similar.length ? (
            <div>
              <p className="eyebrow">Most similar</p>
              <ul className="mt-2 space-y-1">
                {similar.map((h) => (
                  <li key={h.record.id}>
                    <Link href={`/companies/${h.record.id}`} className="flex items-center gap-3 rounded-lg px-1.5 py-1.5 hover:bg-accent/50">
                      <CompanyLogo name={h.record.name} domain={h.record.domain} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{h.record.name}</span>
                        <span className="block truncate text-[11.5px] text-muted-foreground">{h.reasons[0] ?? h.record.subType}</span>
                      </span>
                      <span className="figure text-xs text-muted-foreground">{h.score}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
          <Button onClick={() => onOpen(r.id)}>
            Open profile <ArrowUpRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => onSimilar(r.id)}>
            <Sparkles className="h-4 w-4" /> Find similar
          </Button>
          <Button variant="outline" onClick={() => onToggle(r.id)} className={cn(selected && "border-[var(--brass)]")}>
            {selected ? <Check className="h-4 w-4" /> : null}
            {selected ? "Selected" : "Select"}
          </Button>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
