"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Kanban, ListPlus, Loader2, Pencil, Sparkles, Trash2, X } from "lucide-react";
import {
  addCompaniesToPipeline,
  createList,
  deleteList,
  removeFromList,
  setListItemNote,
  updateList,
  type BulkPipelineResult,
} from "@/lib/directory/actions";
import type { DirectoryList, DirectoryListItem } from "@/lib/directory/queries";
import { headcountLabel, sizeLabel, sizeTitle } from "@/lib/directory/format";
import { locationLabel, unpackIndex, type PackedIndex } from "@/lib/directory/records";
import { CategoryBadge } from "@/components/category-badge";
import { CompanyLogo } from "@/components/company-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmModal, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { cn, timeAgo } from "@/lib/utils";
import { downloadCsv } from "./bulk-bar";

export function NewListButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <ListPlus className="h-4 w-4" /> New list
      </Button>
      {open ? (
        <Modal open onClose={() => setOpen(false)} size="sm">
          <ModalHeader icon={<ListPlus className="h-4 w-4" />} title="New list" description="Shared with the team. Add firms from Discover." onClose={() => setOpen(false)} />
          <ModalBody className="space-y-3">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q1 — London private credit" />
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's it for? (optional)" rows={3} />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              disabled={pending || !name.trim()}
              onClick={() =>
                start(async () => {
                  const r = await createList(name, description);
                  if (!r.ok || !r.id) {
                    setError(r.error ?? "Couldn't create the list.");
                    return;
                  }
                  router.push(`/database/lists/${r.id}`);
                })
              }
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </>
  );
}

function NoteCell({ listId, companyId, note }: { listId: string; companyId: string; note: string | null }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group inline-flex max-w-[260px] items-start gap-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
      >
        <span className="line-clamp-2">{note || "Add a note"}</span>
        <Pencil className="mt-0.5 h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100" />
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
          if (e.key === "Enter") {
            start(async () => {
              await setListItemNote(listId, companyId, text);
              setEditing(false);
              router.refresh();
            });
          }
        }}
        className="h-7 w-52 rounded-md border border-input bg-card px-2 text-xs outline-none focus-visible:border-ring"
        placeholder="Enter to save"
      />
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
    </div>
  );
}

/** One list: its firms, notes and bulk actions. */
export function ListDetail({
  list,
  items,
  packed,
  canDelete,
}: {
  list: DirectoryList;
  items: DirectoryListItem[];
  packed: PackedIndex;
  canDelete: boolean;
}) {
  const index = useMemo(() => unpackIndex(packed), [packed]);
  const byId = useMemo(() => new Map(index.records.map((r) => [r.id, r])), [index]);
  const rows = items.map((i) => ({ item: i, record: byId.get(i.company_id) })).filter((r) => r.record);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pipeline, setPipeline] = useState<BulkPipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const targetIds = selected.size ? [...selected] : rows.map((r) => r.item.company_id);
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.item.company_id));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Team list</p>
          {editing ? (
            <div className="mt-2 space-y-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-md text-lg" />
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="max-w-xl" placeholder="Description" />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={pending || !name.trim()}
                  onClick={() =>
                    start(async () => {
                      const r = await updateList(list.id, { name, description });
                      if (!r.ok) setError(r.error ?? "Couldn't save.");
                      else {
                        setEditing(false);
                        router.refresh();
                      }
                    })
                  }
                >
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="display mt-1 flex items-center gap-2 text-[28px] leading-tight md:text-[34px]">
                {list.name}
                <button type="button" onClick={() => setEditing(true)} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Rename list">
                  <Pencil className="h-4 w-4" />
                </button>
              </h1>
              {list.description ? <p className="mt-1.5 max-w-2xl text-[15px] text-muted-foreground">{list.description}</p> : null}
              <p className="mt-1.5 text-sm text-muted-foreground">
                {rows.length} firm{rows.length === 1 ? "" : "s"}
                {list.owner_name ? ` · by ${list.owner_name}` : ""} · updated {timeAgo(list.updated_at)}
              </p>
            </>
          )}
          {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!rows.length || pending}
            onClick={() =>
              start(async () => {
                const r = await addCompaniesToPipeline(targetIds);
                setPipeline(r);
                if (r.ok) router.refresh();
              })
            }
          >
            <Kanban className="h-4 w-4" /> {selected.size ? `Add ${selected.size} to pipeline` : "Add all to pipeline"}
          </Button>
          <Button asChild variant="outline" disabled={!rows.length}>
            <Link href={`/database?like=${targetIds.slice(0, 10).join(",")}`}>
              <Sparkles className="h-4 w-4" /> Find more like these
            </Link>
          </Button>
          <Button
            variant="outline"
            disabled={!rows.length}
            onClick={() =>
              downloadCsv(
                rows.filter((r) => !selected.size || selected.has(r.item.company_id)).map((r) => r.record!),
                `${list.name.replace(/[^\w-]+/g, "-").toLowerCase()}.csv`,
              )
            }
          >
            <Download className="h-4 w-4" /> Export
          </Button>
          {canDelete ? (
            <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" /> Delete list
            </Button>
          ) : null}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="sheen rounded-2xl border bg-card px-6 py-14 text-center">
          <p className="font-semibold">This list is empty</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Search in Discover, tick the firms you want, then choose <span className="font-medium">Add to list</span>.
          </p>
          <Button asChild className="mt-4">
            <Link href="/database">Open Discover</Link>
          </Button>
        </div>
      ) : (
        <div className="sheen overflow-hidden rounded-2xl border bg-card">
          {selected.size ? (
            <div className="flex items-center gap-3 border-b bg-accent/40 px-5 py-2.5 text-sm">
              <span className="font-medium">{selected.size} selected</span>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await removeFromList(list.id, [...selected]);
                    setSelected(new Set());
                    router.refresh();
                  })
                }
              >
                <X className="h-4 w-4" /> Remove from list
              </Button>
              <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
                Clear
              </button>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="w-10 py-2.5 pl-4 pr-1">
                    <input
                      type="checkbox"
                      checked={allOn}
                      onChange={() => setSelected(allOn ? new Set() : new Set(rows.map((r) => r.item.company_id)))}
                      className="h-4 w-4 accent-[var(--primary)]"
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium">Firm</th>
                  <th className="px-3 py-2.5 text-right font-medium">Size</th>
                  <th className="hidden px-3 py-2.5 text-right font-medium md:table-cell">Team</th>
                  <th className="hidden px-3 py-2.5 text-left font-medium lg:table-cell">Note</th>
                  <th className="hidden px-5 py-2.5 text-left font-medium xl:table-cell">Added</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ item, record: r }) => {
                  const on = selected.has(item.company_id);
                  return (
                    <tr key={item.company_id} className={cn("border-t align-top hover:bg-muted/30", on && "bg-accent/40")}>
                      <td className="py-3 pl-4 pr-1">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => {
                            const next = new Set(selected);
                            if (on) next.delete(item.company_id);
                            else next.add(item.company_id);
                            setSelected(next);
                          }}
                          className="mt-1 h-4 w-4 accent-[var(--primary)]"
                          aria-label={`Select ${r!.name}`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-3">
                          <CompanyLogo name={r!.name} domain={r!.domain} size={32} />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link href={`/companies/${r!.id}`} className="font-semibold hover:text-primary">
                                {r!.name}
                              </Link>
                              <CategoryBadge category={r!.category} />
                              {r!.subType ? <span className="text-xs text-muted-foreground">{r!.subType}</span> : null}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">{locationLabel(r!) ?? ""}</p>
                            <div className="mt-1 lg:hidden">
                              <NoteCell listId={list.id} companyId={item.company_id} note={item.note} />
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular" title={sizeTitle(r!)}>
                        {sizeLabel(r!)}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular text-muted-foreground md:table-cell">
                        {headcountLabel(r!.employees)}
                      </td>
                      <td className="hidden px-3 py-3 lg:table-cell">
                        <NoteCell listId={list.id} companyId={item.company_id} note={item.note} />
                      </td>
                      <td className="hidden whitespace-nowrap px-5 py-3 text-xs text-muted-foreground xl:table-cell">
                        {timeAgo(item.created_at)}
                        {item.added_by_name ? ` · ${item.added_by_name}` : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete “${list.name}”?`}
        description="The list goes; the firms on it stay in the database."
        pending={pending}
        onConfirm={() =>
          start(async () => {
            const r = await deleteList(list.id);
            if (!r.ok) {
              setError(r.error ?? "Couldn't delete.");
              setConfirmDelete(false);
              return;
            }
            router.push("/database/lists");
          })
        }
      />

      {pipeline ? (
        <Modal open onClose={() => setPipeline(null)} size="md">
          <ModalHeader
            icon={<Kanban className="h-4 w-4" />}
            title={pipeline.ok ? `${pipeline.created} lead${pipeline.created === 1 ? "" : "s"} added to your pipeline` : "Couldn't add to the pipeline"}
            description={pipeline.ok ? "Each one starts at New, owned by you." : pipeline.error}
            onClose={() => setPipeline(null)}
          />
          {pipeline.skipped.length ? (
            <ModalBody>
              <p className="text-sm font-medium">Left out ({pipeline.skipped.length})</p>
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">
                {pipeline.skipped.map((s) => (
                  <li key={s.name} className="flex justify-between gap-3">
                    <span className="truncate">{s.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{s.reason}</span>
                  </li>
                ))}
              </ul>
            </ModalBody>
          ) : null}
          <ModalFooter>
            <Button variant="outline" asChild>
              <Link href="/leads">Open leads</Link>
            </Button>
            <Button onClick={() => setPipeline(null)}>Done</Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </div>
  );
}
