import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Link2, Mail, MapPin, Minus, Phone } from "lucide-react";
import { getContact, getNotes } from "@/lib/queries";
import { getParticipationForContact } from "@/lib/event-participants";
import { ContactEvents } from "@/components/events/event-history";
import { CategoryBadge } from "@/components/category-badge";
import { ConnectableBadge, TabPanel } from "@/components/directory/profile-sections";
import { PersonAvatar } from "@/components/person-avatar";
import { EditableField } from "@/components/editable-field";
import { NotesPanel } from "@/components/notes-panel";
import { ContactRating } from "@/components/contact-rating";
import { DeleteButton } from "@/components/delete-button";
import { Gauge } from "@/components/charts/gauge";
import { IntelShell } from "@/components/intel/shell";
import { Box, Stat, StatStrip, SubTabs, Tag } from "@/components/intel/ui";
import { cn } from "@/lib/utils";

// A person's page on the desk register, laid out like a firm's: the header,
// the numbers, then the sections under tabs.

export const dynamic = "force-dynamic";

const TABS = ["profile", "events", "notes"] as const;
type Tab = (typeof TABS)[number];

const ACTION = "inline-flex h-8 items-center gap-1.5 rounded-[4px] border bg-card px-2.5 text-[12px] hover:bg-accent";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await getContact(id);
  return { title: contact?.full_name ? `${contact.full_name} — LPGP Connect` : "Contact — LPGP Connect" };
}

/** A text value in a stat's figure slot: smaller than a number, and honest about a blank. */
function Text({ value }: { value: string | null | undefined }) {
  return value ? <span className="text-[15px]">{value}</span> : <span className="text-[13px] text-muted-foreground">Not on file</span>;
}

export default async function ContactProfile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, { tab: tabParam }] = await Promise.all([params, searchParams]);
  const contact = await getContact(id);
  if (!contact) notFound();
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "profile";

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
  const base = `/contacts/${contact.id}`;
  const eventCount = new Set(events.map((e) => e.event_name)).size;
  const tabs = [
    { key: "profile", label: "Profile", count: null as number | null },
    { key: "events", label: "Events", count: eventCount },
    { key: "notes", label: "Notes", count: notes.length },
  ].map((t) => ({ href: t.key === "profile" ? base : `${base}?tab=${t.key}`, label: t.label, count: t.count, active: tab === t.key }));

  return (
    <IntelShell
      crumbs={[{ href: "/contacts", label: "People" }, ...(contact.company ? [{ href: `/companies/${contact.company.id}?tab=people`, label: contact.company.name }] : []), { label: contact.full_name ?? "—" }]}
      kicker={contact.job_title ?? "Contact"}
      title={
        <span className="flex items-center gap-3">
          <PersonAvatar name={contact.full_name} size={44} />
          <span className="min-w-0">
            <span className="block">{contact.full_name ?? "—"}</span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] font-normal tracking-normal">
              {contact.company ? (
                <Link href={`/companies/${contact.company.id}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                  <CategoryBadge category={contact.company.category} className="rounded-[3px] px-1.5 py-0 text-[10px]" />
                  {contact.company.name}
                </Link>
              ) : null}
              {contact.seniority ? <Tag>{contact.seniority}</Tag> : null}
              {contact.department ? <Tag>{contact.department}</Tag> : null}
              {contact.status ? <Tag strong>{contact.status}</Tag> : null}
              {location ? (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-3 w-3" /> {location}
                </span>
              ) : null}
              {!contact.email && contact.connectable ? <ConnectableBadge /> : null}
              {contact.source === "master_directory" ? <Tag>Master Directory</Tag> : contact.source === "lusha" ? <Tag>Lusha</Tag> : null}
            </span>
          </span>
        </span>
      }
      actions={
        <div className="flex flex-wrap gap-1.5" data-no-print>
          {contact.email ? (
            <a href={`mailto:${contact.email}`} className={ACTION}>
              <Mail className="h-3.5 w-3.5" /> Email
            </a>
          ) : null}
          {contact.phone ? (
            <a href={`tel:${contact.phone}`} className={ACTION}>
              <Phone className="h-3.5 w-3.5" /> Call
            </a>
          ) : null}
          {contact.linkedin_url ? (
            <a href={contact.linkedin_url} target="_blank" rel="noreferrer" className={ACTION}>
              <Link2 className="h-3.5 w-3.5" /> LinkedIn
            </a>
          ) : null}
        </div>
      }
      tabs={<SubTabs items={tabs} />}
    >
      <StatStrip>
        <Stat label="Seniority" value={<Text value={contact.seniority} />} basis={contact.department ?? undefined} />
        <Stat label="Location" value={<Text value={location || null} />} basis={contact.company?.name ?? undefined} />
        <Stat label="Relationship" value={<span className="inline-flex" data-no-print><ContactRating id={contact.id} initial={contact.relationship_strength} /></span>} basis={contact.priority ? `${contact.priority} priority` : "priority not set"} defn="Strength as the team rates it; click a star to change it." />
        <Stat label="Last contacted" value={<Text value={contact.last_contacted} />} basis={contact.status ?? undefined} />
        <Stat label="Events" value={eventCount} basis={events.length ? `${events.length} booking${events.length === 1 ? "" : "s"} on the mastersheet` : "not on any event list"} href={`${base}?tab=events`} />
        <Stat
          label="Profile coverage"
          value={<Gauge value={coverage} size={40} thickness={5} />}
          basis={`${present} of ${coverageFields.length} fields on file`}
          defn="How complete this record is: email, phone, LinkedIn, job title, department and country."
        />
      </StatStrip>

      <TabPanel key={tab}>
        {tab === "profile" ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-4" data-no-print>
              <Box title="Contact details" action={<span className="text-[11px] text-muted-foreground">Hover a field and click the pencil to edit</span>}>
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
              </Box>
              <Box title="Relationship">
                <div className="divide-y">
                  <EditableField entity="contact" id={contact.id} field="status" value={contact.status} label="Status" placeholder="Champion / Warm / Cold" />
                  <EditableField entity="contact" id={contact.id} field="priority" value={contact.priority} label="Priority" placeholder="High / Medium / Low" />
                  <EditableField entity="contact" id={contact.id} field="last_contacted" value={contact.last_contacted} label="Last contacted" placeholder="YYYY-MM-DD" />
                </div>
              </Box>
            </div>
            <div className="space-y-4">
              <Box title="Contact coverage" count={`${present} of ${coverageFields.length}`} flush defn="Which of the six fields a complete record carries are on file for this person.">
                <ul className="divide-y">
                  {coverageFields.map(([label, value]) => (
                    <li key={label} className="flex items-center gap-2.5 px-3 py-1.5 text-[12.5px]">
                      <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded-[3px] border", value ? "border-foreground bg-foreground text-background" : "text-muted-foreground")}>
                        {value ? <Check className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
                      </span>
                      <span className={value ? "" : "text-muted-foreground"}>{label}</span>
                      {label === "Email" && !value && contact.connectable ? (
                        <span className="text-[11px] text-muted-foreground" title="The master sheet flags a direct email for this person. The import keeps only that yes/no, never the address itself, so the address is not stored here.">
                          · held in your master sheet, not stored here
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Box>
              {events.length ? (
                <Box title="Events" count={eventCount} flush action={<Link href={`${base}?tab=events`} className="text-[11.5px] text-muted-foreground hover:text-foreground">All</Link>}>
                  <ContactEvents rows={events.slice(0, 5)} />
                </Box>
              ) : null}
              <details className="rounded-[4px] border bg-card" data-no-print>
                <summary className="cursor-pointer px-3 py-2 text-[12px] font-medium text-muted-foreground hover:text-foreground">Remove this contact</summary>
                <div className="border-t px-3 py-3">
                  <p className="mb-2 text-[11.5px] text-muted-foreground">Removes the person from the database. Their firm and notes on it stay.</p>
                  <DeleteButton kind="contact" id={contact.id} />
                </div>
              </details>
            </div>
          </div>
        ) : null}

        {tab === "events" ? (
          <Box title="Events" count={eventCount} flush defn="Every booking on the sales team's mastersheet for this person: the event, their role, what the firm bought and who booked them.">
            <ContactEvents rows={events} />
          </Box>
        ) : null}

        {tab === "notes" ? (
          <Box title="Notes" count={notes.length}>
            <NotesPanel entityType="contact" entityId={contact.id} notes={notes} />
          </Box>
        ) : null}
      </TabPanel>
    </IntelShell>
  );
}
