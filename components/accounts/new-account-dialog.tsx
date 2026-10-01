"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Handshake, Loader2, Plus } from "lucide-react";
import { createAccount } from "@/lib/account-actions";
import { linkOpsCompany } from "@/lib/ops-actions";
import { OpsMatchPanel } from "@/components/ops/ops-match-panel";
import { ACCOUNT_STATUSES, ACCOUNT_TIERS } from "@/lib/accounts";
import { CATEGORY_ORDER } from "@/lib/categories";
import type { OpsMatch } from "@/lib/ops-types";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCompanyOptions } from "@/components/use-company-options";


export function NewAccountDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<string>("Active");
  const [tier, setTier] = useState("");
  const [renewal, setRenewal] = useState("");
  // Best ops-panel match for the typed name, and whether to link to it.
  // linkOptIn null = follow the default (link when the match is exact).
  const [opsBest, setOpsBest] = useState<OpsMatch | null>(null);
  const [linkOptIn, setLinkOptIn] = useState<boolean | null>(null);

  const companies = useCompanyOptions(name, open);
  const linkedCompany = companies.find(
    (c) => c.name.toLowerCase() === name.trim().toLowerCase(),
  );

  function reset() {
    setName("");
    setCategory("");
    setStatus("Active");
    setTier("");
    setRenewal("");
    setOpsBest(null);
    setLinkOptIn(null);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const shouldLink = Boolean(opsBest) && (linkOptIn ?? Boolean(opsBest?.exact));
      const res = await createAccount({
        name,
        company_id: linkedCompany?.id ?? null,
        category: category || linkedCompany?.category || null,
        status,
        tier,
        renewal_date: renewal,
        ops_company: shouldLink && opsBest ? opsBest.company : null,
        first_sponsored_year: new Date().getFullYear(),
      });
      if (!res.ok) {
        setError(res.error ?? "Could not create account");
        return;
      }
      if (shouldLink && opsBest && res.id) {
        await linkOpsCompany("account", res.id, opsBest);
      }
      setOpen(false);
      reset();
      if (res.id) router.push(`/accounts/${res.id}`);
      else router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New account
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} size="md">
        <ModalHeader
          icon={<Handshake className="h-4.5 w-4.5" />}
          title="New sponsor account"
          description="A won sponsor — the record its points of contact and event allocations hang off."
          onClose={() => setOpen(false)}
        />
        <form onSubmit={submit} className="contents">
          <ModalBody className="space-y-5">
            <div>
              <Label className="mb-1.5">Sponsor name</Label>
              <Input
                list="account-company-options"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Barings"
                required
                autoFocus
              />
              <datalist id="account-company-options">
                {companies.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
              {linkedCompany ? (
                <p className="mt-1.5 text-xs text-primary">
                  Linked to {linkedCompany.name} ({linkedCompany.category}) in the database
                </p>
              ) : null}
            </div>

            <OpsMatchPanel
              companyName={name}
              linkOptIn={linkOptIn}
              onLinkOptIn={setLinkOptIn}
              onResult={setOpsBest}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="mb-1.5">Category</Label>
                <NativeSelect
                  className="w-full"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">—</option>
                  {CATEGORY_ORDER.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div>
                <Label className="mb-1.5">Status</Label>
                <NativeSelect
                  className="w-full"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {ACCOUNT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div>
                <Label className="mb-1.5">Tier</Label>
                <NativeSelect className="w-full" value={tier} onChange={(e) => setTier(e.target.value)}>
                  <option value="">—</option>
                  {ACCOUNT_TIERS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div>
                <Label className="mb-1.5">Renewal date</Label>
                <Input type="date" value={renewal} onChange={(e) => setRenewal(e.target.value)} />
              </div>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create account
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}
