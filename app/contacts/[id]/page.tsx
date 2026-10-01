import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone, Link2, MapPin, Check, Minus } from "lucide-react";
import { getContact, getNotes } from "@/lib/queries";
import { getParticipationForContact } from "@/lib/event-participants";
import { ContactEvents } from "@/components/events/event-history";
import { CategoryBadge } from "@/components/category-badge";
import { ConnectableBadge } from "@/components/directory/profile-sections";
import { PersonAvatar } from "@/components/person-avatar";
import { EditableField } from "@/components/editable-field";
import { NotesPanel } from "@/components/notes-panel";
import { ContactRating } from "@/components/contact-rating";
import { DeleteButton } from "@/components/delete-button";
import { Gauge } from "@/components/charts/gauge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground/80">
      {children}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 text-lg font-semibold truncate">{value || "—"}</p>
    </div>
  );
}

export default async function ContactProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await getContact(id);
  if (!contact) notFound();

  const [notes, events] = await Promise.all([getNotes("contact", id), getParticipationForContact(id)]);

  // Profile coverage — how complete this record is.
  const coverageFields: [string, string | null][] = [
    ["Email", contact.email],
    ["Phone", contact.phone],
    ["LinkedIn", contact.linkedin_url],
    ["Job title", contact.job_title],
    ["Department", contact.department],
    ["Country", contact.country],
  ];
  const present = coverageFields.filter(([, v]) => Boolean(v)).length;
  const coverage = Math.round((present / coverageFields.length) * 100);
  const location = [contact.city, contact.country].filter(Boolean).join(", ");

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 py-8 space-y-6">
      <Link
        href="/contacts"
        data-no-print
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Contacts
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-4 min-w-0">
          <PersonAvatar name={contact.full_name} size={56} />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              People <span className="mx-1">/</span> {contact.full_name ?? "—"}
            </p>
            <h1 className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight">
              {contact.full_name ?? "—"}
            </h1>
            <p className="mt-0.5 text-muted-foreground">{contact.job_title ?? "—"}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {contact.company ? (
                <Link href={`/companies/${contact.company.id}`} className="inline-flex items-center gap-1.5">
                  <CategoryBadge category={contact.company.category} />
                  <span className="text-sm font-medium hover:text-primary">{contact.company.name}</span>
                </Link>
              ) : null}
              {contact.seniority ? <Chip>{contact.seniority}</Chip> : null}
              {contact.department ? <Chip>{contact.department}</Chip> : null}
              {contact.status ? <Chip>{contact.status}</Chip> : null}
              {location ? (
                <Chip>
                  <MapPin className="h-3 w-3" /> {location}
                </Chip>
              ) : null}
              {!contact.email && contact.connectable ? <ConnectableBadge /> : null}
              {contact.source === "master_directory" ? <Chip>Master Directory</Chip> : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0" data-no-print>
          {contact.email ? (
            <Button asChild variant="outline">
              <a href={`mailto:${contact.email}`}>
                <Mail className="h-4 w-4" /> Email
              </a>
            </Button>
          ) : null}
          {contact.phone ? (
            <Button asChild variant="outline">
              <a href={`tel:${contact.phone}`}>
                <Phone className="h-4 w-4" /> Call
              </a>
            </Button>
          ) : null}
          {contact.linkedin_url ? (
            <Button asChild>
              <a href={contact.linkedin_url} target="_blank" rel="noreferrer">
                <Link2 className="h-4 w-4" /> LinkedIn
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Quick facts + coverage */}
      <div className="grid gap-4 md:grid-cols-4">
        <Fact label="Seniority" value={contact.seniority} />
        <Fact label="Department" value={contact.department} />
        <Fact label="Location" value={location} />
        <div className="rounded-xl border bg-card p-5 flex items-center gap-4">
          <Gauge value={coverage} size={84} thickness={10} />
          <div>
            <p className="eyebrow">Profile coverage</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {present} of {coverageFields.length} fields
            </p>
          </div>
        </div>
      </div>

      {/* Relationship + contact methods */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3 rounded-xl border bg-secondary p-6">
          <h2 className="text-lg font-semibold">Relationship</h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-3">
            <div>
              <p className="eyebrow">Strength</p>
              <div className="mt-2" data-no-print>
                <ContactRating id={contact.id} initial={contact.relationship_strength} />
              </div>
            </div>
            <div>
              <p className="eyebrow">Priority</p>
              <p className="mt-1.5 font-semibold">{contact.priority ?? "—"}</p>
            </div>
            <div>
              <p className="eyebrow">Last contacted</p>
              <p className="mt-1.5 font-semibold">{contact.last_contacted ?? "—"}</p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 rounded-xl border bg-card p-6">
          <p className="eyebrow mb-3">Contact coverage</p>
          <ul className="space-y-2">
            {coverageFields.map(([label, value]) => (
              <li key={label} className="flex items-center gap-2.5 text-sm">
                <span
                  className={
                    "grid h-5 w-5 place-items-center rounded-full shrink-0 " +
                    (value ? "bg-foreground text-background" : "border text-muted-foreground")
                  }
                >
                  {value ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                </span>
                <span className={value ? "" : "text-muted-foreground"}>{label}</span>
                {label === "Email" && !value && contact.connectable ? (
                  <span className="text-xs text-muted-foreground" title="The master sheet flags a direct email for this person. The import keeps only that yes/no, never the address itself, so the address is not stored here.">
                    · held in your master sheet, not stored here
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {events.length ? (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold mb-3">
            Events <span className="text-muted-foreground font-normal">· {events.length}</span>
          </h2>
          <ContactEvents rows={events} />
        </section>
      ) : null}

      {/* Editable details + notes */}
      <div className="grid gap-6 lg:grid-cols-3" data-no-print>
        <aside className="rounded-xl border bg-card p-5 h-fit space-y-5">
          <div>
            <h2 className="font-semibold">Contact details</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Hover a field and click the pencil to edit.</p>
            <Separator className="my-3" />
            <div className="divide-y">
              <EditableField entity="contact" id={contact.id} field="first_name" value={contact.first_name} label="First name" />
              <EditableField entity="contact" id={contact.id} field="last_name" value={contact.last_name} label="Last name" />
              <EditableField entity="contact" id={contact.id} field="job_title" value={contact.job_title} label="Job title" />
              <EditableField entity="contact" id={contact.id} field="department" value={contact.department} label="Department" />
              <EditableField entity="contact" id={contact.id} field="seniority" value={contact.seniority} label="Seniority" />
              <EditableField entity="contact" id={contact.id} field="email" value={contact.email} label="Email" link="email" />
              <EditableField entity="contact" id={contact.id} field="phone" value={contact.phone} label="Phone" link="tel" />
              <EditableField entity="contact" id={contact.id} field="linkedin_url" value={contact.linkedin_url} label="LinkedIn" link="url" />
              <EditableField entity="contact" id={contact.id} field="city" value={contact.city} label="City" />
              <EditableField entity="contact" id={contact.id} field="country" value={contact.country} label="Country" />
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Relationship</h3>
            <Separator className="my-3" />
            <div className="divide-y">
              <EditableField entity="contact" id={contact.id} field="status" value={contact.status} label="Status" placeholder="Champion / Warm / Cold" />
              <EditableField entity="contact" id={contact.id} field="priority" value={contact.priority} label="Priority" placeholder="High / Medium / Low" />
              <EditableField entity="contact" id={contact.id} field="last_contacted" value={contact.last_contacted} label="Last contacted" placeholder="YYYY-MM-DD" />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-destructive">Danger zone</h3>
            <p className="text-xs text-muted-foreground mt-0.5 mb-3">Removes this contact.</p>
            <DeleteButton kind="contact" id={contact.id} />
          </div>
        </aside>

        <section className="lg:col-span-2 rounded-xl border bg-card p-5">
          <h2 className="font-semibold mb-3">Notes</h2>
          <NotesPanel entityType="contact" entityId={contact.id} notes={notes} />
        </section>
      </div>
    </div>
  );
}
