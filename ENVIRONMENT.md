# Environment variables -- both apps, end to end

Two apps, two sets of variables, and three values that have to match across
them. This is everything needed to get the system fully live.

| | Sales CRM (`LPGP-CRM`) | Ops panel (`TrackerLPGP`) |
| --- | --- | --- |
| Hosts | Next.js on Vercel | Express on Vercel |
| Stores | Supabase Postgres | Neon Postgres |
| Owns | leads, accounts, contacts, activity | signed deals, invoices, event allocations |
| Set variables in | Project -> Settings -> Environment Variables | same, on the other project |
| Local file | `.env.local` | `.env` |

Copy `.env.local.example` (CRM) and `.env.example` (tracker) as your starting
points. Neither file contains a real secret.

---

## 1. Sales CRM

### Supabase -- required

From your Supabase project, **Settings -> API**.

| Variable | Value | Without it |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | Every page shows "connect Supabase" instead of data |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` `public` key | Same |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` `secret` key | Reads work, writes fail: no imports, notes, activities or profile edits |

The first two are public by design and guarded by row-level security. The
service-role key bypasses RLS entirely, is only ever read in server code, and
must never be committed or exposed to the browser.

Before any of this works, run the SQL: `supabase/sql-parts/1-schema/` parts 1
to 11, in order, in the Supabase SQL editor. Already ran parts 1 to 8 before
the directory upgrade? Run `supabase/sql-parts/3-directory/` parts 1 to 4 (the
same SQL as schema parts 9 to 11), then load the data from **Import -> Master
directory**.

### Auth -- required

Sign-in is Supabase Auth with email and password.

1. Supabase -> **Authentication -> Providers**, enable **Email**.
2. Supabase -> **Authentication -> Users**, add each teammate.

A `profiles` row is created automatically on first sign-in.

| Variable | Value | Without it |
| --- | --- | --- |
| `ADMIN_EMAILS` | Comma-separated emails that get super-admin rights | Nobody can allocate or reassign leads across the team |

You can also promote someone later with SQL: set `profiles.role = 'admin'`.

### The bridge to the ops panel -- required for anything money-related

| Variable | Value | Without it |
| --- | --- | --- |
| `OPS_PANEL_URL` | The tracker's origin, no trailing slash | Every ops feature hides itself |
| `OPS_BRIDGE_KEY` | The shared read secret | Same |
| `OPS_BRIDGE_WRITE_KEY` | The shared write secret, optional | Reads work; "Record deal" is hidden and writes refuse |

These control the features you asked for: the heads-up when a teammate already
has a firm in their pipeline, event performance against target, My deals, and
recording a deal into the tracker from here.

### Lusha -- optional

| Variable | Value | Without it |
| --- | --- | --- |
| `LUSHA_API_KEY` | REST key from the Lusha dashboard | Lusha search and import are hidden; spreadsheet import still works |

Server-only. The key never reaches the browser.

### AI thesis search -- optional

| Variable | Value | Without it |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | An Anthropic API key (console.anthropic.com) | Discover reads searches with its built-in rules only |

Discover answers every search instantly from built-in rules. With this key set
on the CRM project, Claude (`claude-opus-5-5`, low effort) also re-reads each
search into the same filters a moment later and the results update, with a
one-line explanation and a link back to the quick reading. The tracker has its
own `ANTHROPIC_API_KEY`; the same key can be used on both projects. Server-only.

---

## 2. Ops panel

### Database -- required

| Variable | Value | Without it |
| --- | --- | --- |
| `DATABASE_URL` | Neon connection string (`POSTGRES_URL` also accepted) | Every page reports the database is not configured |

### Session signing -- required in production

| Variable | Value | Without it |
| --- | --- | --- |
| `JWT_SECRET` | Your own random string | **The app falls back to a value hard-coded in the source** |

Worth stating plainly: the fallback is readable by anyone who can see the
repository, and it signs the login cookie for the app that holds your invoices.
Set your own before the tracker is reachable from the internet.

```sh
openssl rand -hex 32
```

### The bridge -- must match the CRM

| Variable | Value |
| --- | --- |
| `OPS_BRIDGE_KEY` | Identical to the CRM's `OPS_BRIDGE_KEY` |
| `OPS_BRIDGE_WRITE_KEY` | Identical to the CRM's, and different from the read key |

### Email and assistant -- optional

`ADMIN_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
`SMTP_PASS`, `SMTP_FROM` drive admin notification mail. Leave `SMTP_HOST`
unset and nothing is sent, with no errors. `ANTHROPIC_API_KEY` powers the
in-app assistant only.

---

## 3. The three values that must match

Generate each one **once**, then paste the same string into both projects.

```sh
openssl rand -hex 32   # OPS_BRIDGE_KEY
openssl rand -hex 32   # OPS_BRIDGE_WRITE_KEY  (must differ from the read key)
```

| Value | On the CRM | On the tracker | Must be equal |
| --- | --- | --- | --- |
| Read secret | `OPS_BRIDGE_KEY` | `OPS_BRIDGE_KEY` | yes |
| Write secret | `OPS_BRIDGE_WRITE_KEY` | `OPS_BRIDGE_WRITE_KEY` | yes |
| Tracker address | `OPS_PANEL_URL` | n/a | n/a |

Two separate secrets is deliberate. The read key is on more surfaces and is
the likelier one to leak; on its own it can never create a financial record.

Both apps compare these over a SHA-256 digest rather than character by
character, so a wrong key cannot be guessed by timing the response.

---

## 4. Checking it worked

1. Sign in to the CRM and open **Settings**. It performs a live handshake
   against the tracker and tells you which of three states you are in: not
   configured, reads only, or reads and writes.
2. A wrong key says so immediately rather than failing silently later.
3. Open **Event performance**. Events and money come from the tracker; if they
   are there, the bridge is working.
4. Open **My deals**. Deals the tracker has stamped with your initials appear
   on their own. If yours are missing, an admin sets each person's initials on
   the **Team & assignments** page, and they have to match the ones the tracker
   stamps on deals.

---

## 5. Minimum sets

**Just the CRM, no money features:** the three Supabase variables plus
`ADMIN_EMAILS`. Everything ops-related hides itself cleanly.

**Everything except recording deals from the CRM:** add `OPS_PANEL_URL` and
`OPS_BRIDGE_KEY` to the CRM, and `OPS_BRIDGE_KEY` to the tracker.

**Everything:** add `OPS_BRIDGE_WRITE_KEY` to both.
