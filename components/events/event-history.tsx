import Link from "next/link";
import type { Participation } from "@/lib/event-participants";
import { Empty, Tag } from "@/components/intel/ui";

function Status({ p }: { p: Participation }) {
  if (p.status === "cancelled") return <span className="text-muted-foreground">Cancelled</span>;
  return <span>{p.invite_status ?? "—"}</span>;
}

/** A person's events, one row each. */
export function ContactEvents({ rows }: { rows: Participation[] }) {
  if (!rows.length) return <Empty>Not on any event list yet.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="desk-table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Role</th>
            <th>Bought</th>
            <th>Booked by</th>
            <th>Invite</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="font-medium whitespace-nowrap">{p.event_name}</td>
              <td className="capitalize text-muted-foreground">{p.role ?? "—"}</td>
              <td>{p.sponsor_tier ? <Tag>{p.sponsor_tier}</Tag> : <span className="text-muted-foreground">—</span>}</td>
              <td className="text-muted-foreground">{p.booked_by ?? "—"}</td>
              <td className="text-muted-foreground">
                <Status p={p} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A firm's events: what it bought at each, and who it sent. */
export function CompanyEvents({ rows }: { rows: Participation[] }) {
  if (!rows.length) return <Empty>This firm is not on any event list yet.</Empty>;
  const byEvent = new Map<string, Participation[]>();
  for (const r of rows) byEvent.set(r.event_name, [...(byEvent.get(r.event_name) ?? []), r]);
  return (
    <div className="overflow-x-auto">
      <table className="desk-table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Bought</th>
            <th>People</th>
          </tr>
        </thead>
        <tbody>
          {[...byEvent.entries()].map(([event, people]) => {
            const tiers = [...new Set(people.map((p) => p.sponsor_tier).filter((t): t is string => Boolean(t)))];
            return (
              <tr key={event}>
                <td className="font-medium whitespace-nowrap align-top">{event}</td>
                <td className="align-top">
                  {tiers.length ? (
                    <span className="flex flex-wrap gap-1">
                      {tiers.map((t) => (
                        <Tag key={t}>{t}</Tag>
                      ))}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td>
                  <ul className="space-y-0.5">
                    {people.map((p) => (
                      <li key={p.id} className={p.status === "cancelled" ? "text-muted-foreground line-through" : ""}>
                        {p.contact ? (
                          <Link href={`/contacts/${p.contact.id}`} className="hover:underline">
                            {p.contact.full_name ?? "—"}
                          </Link>
                        ) : (
                          "—"
                        )}
                        <span className="text-muted-foreground">
                          {p.contact?.job_title ? ` · ${p.contact.job_title}` : ""}
                          {p.role ? ` · ${p.role}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
