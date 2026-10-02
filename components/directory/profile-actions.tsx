"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ListPlus, Loader2, Sparkles } from "lucide-react";
import { addToList, classifyCompany } from "@/lib/directory/actions";
import { CATEGORIES, CATEGORY_ORDER } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

export function FindSimilarButton({ companyId }: { companyId: string }) {
  return (
    <Button asChild variant="outline">
      <Link href={`/database?like=${companyId}`}>
        <Sparkles className="h-4 w-4" /> Find similar
      </Link>
    </Button>
  );
}

/** Put this firm on a team list — an existing one or a new one. */
export function AddToListButton({
  companyId,
  lists,
  onLists,
}: {
  companyId: string;
  lists: { id: string; name: string }[];
  /** Lists this firm is already on. */
  onLists: string[];
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<string>("new");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const on = new Set(onLists);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <ListPlus className="h-4 w-4" /> Add to list
      </Button>
      {open ? (
        <Modal open onClose={() => setOpen(false)} size="sm">
          <ModalHeader
            icon={<ListPlus className="h-4 w-4" />}
            title="Add to a list"
            description="Lists are shared with the team."
            onClose={() => setOpen(false)}
          />
          <ModalBody className="space-y-1.5">
            {lists.map((l) => (
              <label
                key={l.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm",
                  choice === l.id && "border-primary bg-accent/40",
                  on.has(l.id) && "opacity-60",
                )}
              >
                <input
                  type="radio"
                  name="list"
                  checked={choice === l.id}
                  disabled={on.has(l.id)}
                  onChange={() => setChoice(l.id)}
                  className="accent-[var(--primary)]"
                />
                <span className="flex-1 truncate">{l.name}</span>
                {on.has(l.id) ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Check className="h-3 w-3" /> on it
                  </span>
                ) : null}
              </label>
            ))}
            <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm", choice === "new" && "border-primary bg-accent/40")}>
              <input type="radio" name="list" checked={choice === "new"} onChange={() => setChoice("new")} className="accent-[var(--primary)]" />
              <span className="flex-1">New list</span>
            </label>
            {choice === "new" ? (
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="List name" />
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              disabled={pending || (choice === "new" && !name.trim())}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await addToList({
                    listId: choice === "new" ? null : choice,
                    newListName: choice === "new" ? name : null,
                    companyIds: [companyId],
                  });
                  if (!r.ok) {
                    setError(r.error ?? "Couldn't add.");
                    return;
                  }
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Add
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </>
  );
}

/** Place a firm the workbook left unclassified into LP, GP or SP. */
export function ClassifyControl({ companyId }: { companyId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  // Desk register: a dashed 4px box, the three books as desk buttons.
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[4px] border border-dashed bg-card px-3 py-2 text-[12.5px]">
      <span className="text-muted-foreground">Unclassified in the Master Directory. Place it in a book:</span>
      {CATEGORY_ORDER.map((c) => (
        <button
          key={c}
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await classifyCompany(companyId, c);
              if (!r.ok) setError(r.error ?? "Couldn't classify.");
              else router.refresh();
            })
          }
          className="inline-flex h-8 items-center rounded-[4px] border bg-card px-2.5 text-[12px] font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
        >
          {CATEGORIES[c].name}
        </button>
      ))}
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
      {error ? <span className="text-destructive">{error}</span> : null}
    </div>
  );
}
