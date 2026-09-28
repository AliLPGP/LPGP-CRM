"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Kanban, ListPlus, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { addCompaniesToPipeline, addToList, type BulkPipelineResult } from "@/lib/directory/actions";
import { deleteCompanies } from "@/lib/actions";
import { CATEGORIES } from "@/lib/categories";
import { toCsv } from "@/lib/csv";
import { AUM_KIND_LABEL, type DirectoryRecord } from "@/lib/directory/records";
import { Button } from "@/components/ui/button";
import { ConfirmModal, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ListOption = { id: string; name: string; item_count: number };

/** Download records as a CSV the way Excel expects it (BOM, CRLF). */
export function downloadCsv(records: DirectoryRecord[], filename: string) {
  const csv = toCsv(
    [
      "Name", "Book", "Type", "City", "State", "Country", "Size (USD)", "Size basis", "Employees",
      "Founded", "Form ADV", "Private funds", "Key contacts", "Website", "Description",
    ],
    records.map((r) => [
      r.name,
      CATEGORIES[r.category].name,
      r.subType,
      r.city,
      r.state,
      r.country,
      r.aum != null ? Math.round(r.aum) : null,
      r.aumKind ? AUM_KIND_LABEL[r.aumKind] : null,
      r.employees,
      r.founded,
      r.adv,
      r.privateFunds,
      r.contacts,
      r.domain ? `https://${r.domain}` : null,
      r.description,
    ]),
  );
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function AddToListModal({
  open,
  onClose,
  ids,
  lists,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  ids: string[];
  lists: ListOption[];
  onDone: (message: string) => void;
}) {
  const [choice, setChoice] = useState<string>(lists[0]?.id ?? "new");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit() {
    setError(null);
    start(async () => {
      const r = await addToList({
        listId: choice === "new" ? null : choice,
        newListName: choice === "new" ? name : null,
        companyIds: ids,
      });
      if (!r.ok) {
        setError(r.error ?? "Couldn't add to the list.");
        return;
      }
      const listName = choice === "new" ? name.trim() : lists.find((l) => l.id === choice)?.name;
      onDone(`${r.added ?? 0} added to “${listName}”.`);
      router.refresh();
      onClose();
    });
  }

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <ModalHeader
        icon={<ListPlus className="h-4 w-4" />}
        title={`Add ${ids.length} firm${ids.length === 1 ? "" : "s"} to a list`}
        description="Lists are shared with the team."
        onClose={onClose}
      />
      <ModalBody className="space-y-1.5">
        {lists.map((l) => (
          <label key={l.id} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm", choice === l.id && "border-primary bg-accent/40")}>
            <input type="radio" name="list" checked={choice === l.id} onChange={() => setChoice(l.id)} className="accent-[var(--primary)]" />
            <span className="flex-1 truncate">{l.name}</span>
            <span className="tabular text-xs text-muted-foreground">{l.item_count}</span>
          </label>
        ))}
        <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm", choice === "new" && "border-primary bg-accent/40")}>
          <input type="radio" name="list" checked={choice === "new"} onChange={() => setChoice("new")} className="accent-[var(--primary)]" />
          <span className="flex-1">New list</span>
        </label>
        {choice === "new" ? (
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. London private credit — Q1 outreach" />
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending || (choice === "new" && !name.trim())}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Add to list
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function PipelineModal({
  open,
  onClose,
  result,
}: {
  open: boolean;
  onClose: () => void;
  result: BulkPipelineResult | null;
}) {
  return (
    <Modal open={open} onClose={onClose} size="md">
      <ModalHeader
        icon={<Kanban className="h-4 w-4" />}
        title={result?.ok ? `${result.created} lead${result.created === 1 ? "" : "s"} added to your pipeline` : "Couldn't add to the pipeline"}
        description={result?.ok ? "Each one starts at New, owned by you." : result?.error}
        onClose={onClose}
      />
      {result?.skipped.length ? (
        <ModalBody>
          <p className="text-sm font-medium">Left out ({result.skipped.length})</p>
          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">
            {result.skipped.map((s) => (
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
        <Button onClick={onClose}>Done</Button>
      </ModalFooter>
    </Modal>
  );
}

export function BulkBar({
  selected,
  records,
  lists,
  isAdmin,
  signedIn,
  onClear,
  onSimilar,
  onNotice,
}: {
  selected: Set<string>;
  records: DirectoryRecord[];
  lists: ListOption[];
  isAdmin: boolean;
  signedIn: boolean;
  onClear: () => void;
  onSimilar: (ids: string[]) => void;
  onNotice: (message: string) => void;
}) {
  const [listOpen, setListOpen] = useState(false);
  const [pipeline, setPipeline] = useState<BulkPipelineResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const ids = [...selected];

  if (!ids.length) return null;

  return (
    <>
      <div className="sticky bottom-4 z-30 mx-auto flex w-fit max-w-full flex-wrap items-center gap-1.5 rounded-2xl border bg-popover px-3 py-2 shadow-[var(--shadow-pop)]">
        <span className="px-1.5 text-sm font-medium">
          <span className="figure">{ids.length}</span> selected
        </span>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button size="sm" variant="ghost" onClick={() => setListOpen(true)} disabled={!signedIn}>
          <ListPlus className="h-4 w-4" /> Add to list
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!signedIn || pending}
          onClick={() =>
            start(async () => {
              const r = await addCompaniesToPipeline(ids);
              setPipeline(r);
              if (r.ok) router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Kanban className="h-4 w-4" />} Add to pipeline
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onSimilar(ids.slice(0, 10))}>
          <Sparkles className="h-4 w-4" /> Find similar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => downloadCsv(records.filter((r) => selected.has(r.id)), `lpgp-firms-${ids.length}.csv`)}
        >
          <Download className="h-4 w-4" /> Export
        </Button>
        {isAdmin ? (
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        ) : null}
        <button
          type="button"
          onClick={onClear}
          className="ml-1 grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Clear selection"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {listOpen ? (
        <AddToListModal open onClose={() => setListOpen(false)} ids={ids} lists={lists} onDone={onNotice} />
      ) : null}
      <PipelineModal open={pipeline != null} onClose={() => setPipeline(null)} result={pipeline} />
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${ids.length} firm${ids.length === 1 ? "" : "s"}?`}
        description="Their contacts, notes, provider links and commitments go too. Leads and accounts keep their own copy of the name. This can't be undone."
        pending={pending}
        error={deleteError}
        onConfirm={() =>
          start(async () => {
            setDeleteError(null);
            const r = await deleteCompanies(ids);
            if (!r.ok) {
              setDeleteError(r.error ?? "Couldn't delete.");
              return;
            }
            setConfirmDelete(false);
            onClear();
            onNotice(`${ids.length} firm${ids.length === 1 ? "" : "s"} deleted.`);
            router.refresh();
          })
        }
      />
    </>
  );
}
