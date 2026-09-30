# LPGP Connect — Sales CRM

The sales side of **LPGP Connect** (finance, capital markets, private markets).
Companies sit in three books — **LPs** (institutional investors), **GPs** (fund
managers & VCs) and **SPs** (solution providers) — each with a roster of senior
contacts.

It runs alongside the **ops panel** (`TrackerLPGP`), which holds signed deals,
invoices and how each sponsor's money is allocated across events. That panel
stays the single source of truth for money; this CRM reads it, and can
optionally record deals into it.

> Add **Barings** to your pipeline and, before you've finished typing, the form
> tells you John already has Barings for Miami (Discussing, touched 3 days ago)
> and that Barings has already signed for Berlin — £2,000, Gold, paid, signed by
> John Smith. Nothing is filled in and nothing is blocked; you just know.

## Features

### Selling

- **Command centre** — calls made today, connect rate, open pipeline, what needs
  you now, plus the queue's next six leads and live event revenue from the tracker.
- **Call workspace** (`/leads/workspace`) — work a queue one lead at a time:
  click to dial, a running timer, eight one-key dispositions, notes, stage change
  and call-back scheduling, then **Save & next**. Overdue call-backs sort first,
  then high priority, then never-called, then the stalest lead — so working
  top-to-bottom is always the right order. `1`–`8` pick an outcome, `c` dials,
  `n`/`p` move, `⌘↵` saves.
- **Heads-up on add** — every lead says which events it's for. Adding a company
  checks, per event, whether a teammate is already on it or it has already signed
  (per the ops panel, with the signer resolved from their initials), and says so
  before you reach out. Informational only: it never edits the form. The same
  check holds a one-click add from a company profile until you've seen it, and
  the call workspace shows "also in the pipeline" before you dial.
- **Pipeline board** — drag leads between stages, filter by market or owner.
- **Accounts** — one record per sponsor won, with tabs for **points of contact**
  (full CRUD, one primary each), **events & money** (allocations straight from
  the tracker), activity and notes. Calling or emailing a contact from the card
  logs it, so the timeline can't overstate how often you've been in touch.
- **Spreadsheet import** — drop in an `.xlsx`/`.csv`, confirm the auto-matched
  columns, and import. Duplicates are filtered against the pipeline *and* within
  the file, and any company already sponsoring an event is flagged and linked.
- **My deals** — your deals as the tracker holds them, picked up automatically
  from the initials it stamps on each one. Adding a deal checks the tracker
  first: if something like it is already there you're asked "is it this one?"
  and can adopt it instead of entering the same business twice. Each deal shows
  where its paperwork stands — **need to send invoice**, awaiting signature, or
  signed.
- **Event performance** — every event in the ops panel against a target you set
  here, with per-portfolio roll-ups across the seven programme series, and an
  expandable list of who is sponsoring each event and who has paid.
- **⌘K palette** — jump to any page or search leads, sponsors, firms and people.

### Database

An Inven-style intelligence database over the team's **Master Directory**
workbook: every GP, LP and provider in it, their key contacts, the service
providers each manager names on Form ADV, and public LP commitments.

- **Discover** (`/database`) — describe what you're after in plain English
  ("private credit managers in London with $1bn+ AUM audited by KPMG") and it
  becomes removable filter chips: book, type, place, size, headcount, founding
  year, Form ADV status, providers used, contacts on file. Whatever the rules
  don't recognise is ranked as keywords, with the matching sentence
  highlighted. With `ANTHROPIC_API_KEY` set, Claude re-reads each search a
  moment later. Facet counts, sorting and paging are instant — the directory
  is searched in the browser. Tick firms to add them to a list, the pipeline or
  a CSV, or to find more like them.
- **Lookalikes** — "firms like Ares", or any selection: similarity blends what
  firms say they do with type, place, size and the providers they share on
  Form ADV, and every match lists its reasons.
- **Company one-pager** — key facts, overview, SP service lines and lifecycle
  coverage, the providers a manager files by role, the managers a provider
  serves and where it ranks, LP commitments made and received (in their own
  currency), the Form ADV entities behind the figures, key contacts, similar
  firms and every source.
- **Market map** (`/database/market`) — league tables of auditors,
  administrators, custodians, prime brokers and placement agents by the number
  of managers that name them, sliced by manager type, region and size; plus a
  landscape of each book by segment. Every provider has a page listing its
  clients and the legal names it's filed under.
- **Lists** (`/database/lists`) — shared target lists with notes, export and
  one-click "add all to pipeline".
- **Import → Master directory** (admins) — reads the workbook in the browser,
  merges duplicate rows, collapses 2,000+ provider spellings into brands,
  matches firms already in the CRM, and loads everything in chunks. Re-running
  it with the next edition updates records in place.
- **Contact profiles** — inline-editable, with free-text notes on any record.
- **Lusha** — look people up on demand from Discover, import them, and export
  contacts and companies to CSV.

## Quick start

```bash
pnpm install
cp .env.local.example .env.local   # fill in Supabase (+ Lusha, + ops panel)
pnpm dev                           # http://localhost:3000
```

### 1. Create the database

In the Supabase dashboard → **SQL Editor**, paste and run
[`supabase/schema.sql`](supabase/schema.sql). That single file creates
everything — the database tables, the leads pipeline, the sales layer
(accounts, points of contact, activities, tasks, ops links), event targets, the
events each lead is for, per-user initials and claimed deals. It's idempotent,
so it's safe to re-run.

> Prefer step-by-step migrations? Run the files in
> [`supabase/migrations/`](supabase/migrations) **in numeric order**
> (`0001` → … → `0016`). Running a later one first fails with
> `relation "public.companies" does not exist` — that just means `0001`
> hasn't run yet.

### 2. Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | Project URL (reads) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API | Anon key (reads) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API | Server writes (import/edits) — **secret** |
| `LUSHA_API_KEY` | Lusha dashboard → API | In-app lead import — **secret** |
| `COMPANIES_HOUSE_API_KEY` | _optional_ — developer.company-information.service.gov.uk | Filed accounts and officers of UK portfolio companies and borrowers — **secret** |
| `ADMIN_EMAILS` | _optional_ | Comma-separated super admins |
| `OPS_PANEL_URL` | _optional_ | The tracker's origin, no trailing slash |
| `OPS_BRIDGE_KEY` | _optional_ | Read secret, **identical on both apps** — **secret** |
| `OPS_BRIDGE_WRITE_KEY` | _optional_ | Write secret — a **different** value, also on both apps |

Add the same variables in **Vercel → Project → Settings → Environment Variables**.

### 3. Connect the ops panel

Skip this and the CRM simply hides every ops-panel feature.

```bash
openssl rand -hex 32          # generate the shared secret
```

1. On **TrackerLPGP**, set `OPS_BRIDGE_KEY` to that value and redeploy.
2. Here, set `OPS_PANEL_URL` to the tracker's URL and `OPS_BRIDGE_KEY` to the
   same value.
3. Open **Settings** — it performs a live handshake and reports the deal, event
   and allocation counts it can see. A wrong key says so there rather than
   failing quietly later.
4. In **Admin → Team**, set each person's initials to match what the tracker
   stamps on their deals. That's what turns "signed by JS" into "signed by
   John Smith", and what gets stamped on deals recorded from this side.

The tracker exposes a `/api/bridge/*` surface guarded by that secret. Reads are
all you need for the match notice, account allocations and Event performance.

**Recording deals from the CRM** is optional and off by default. Set a *second*,
different secret as `OPS_BRIDGE_WRITE_KEY` on both apps and a "Record deal"
action appears on accounts and events: it writes the deal, its per-event
allocation and the invoice file straight into the tracker. The tracker stays
the single source of truth for money — the CRM becomes a second front-end onto
it, not a second copy of it. Keeping the keys separate means a leaked read key
can never create a financial record.

### 4. Deploy

```bash
pnpm dlx vercel --prod --yes
```

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · shadcn/ui · Supabase · Lusha.
