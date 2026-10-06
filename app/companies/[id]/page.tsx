import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Globe, Link2 } from "lucide-react";
import { getDirectoryIndex } from "@/lib/directory/index-server";
import { getProfileCounts, profileCompany, type ProfileCounts } from "@/lib/directory/profile-queries";
import { getLpBook } from "@/lib/directory/lp-profile";
import { getGpBackers } from "@/lib/directory/gp-profile";
import { filers, leagueTable } from "@/lib/directory/market";
import { PROVIDER_ROLES } from "@/lib/directory/providers";
import { CATEGORIES } from "@/lib/categories";
import { getSessionUser } from "@/lib/auth";
import { CompanyLogo } from "@/components/company-logo";
import { Commitments } from "@/components/directory/profile-ledgers";
import { LpClassView, type ClassSort } from "@/components/directory/lp-overview";
import type { RoleRank } from "@/components/directory/profile-sections";
import { BackLink, ChapterSkeleton, Chip, FiguresSkeleton, Meter, StoryPage, fmtPct } from "@/components/story/story";
import type { Company } from "@/lib/types";
import { ClientsTab, DealsTab, EditTab, EventsTab, FundsTab, InvestorTab, NotesTab, PeersTab, PeopleTab, PortfolioTab, ProvidersTab, SignalsTab, TabSkeleton } from "./tabs";
import { GpStory, HeroActions, HeroFigures, LpStory, OtherStory, SimilarChapter } from "./story";

export const dynamic = "force-dynamic";

// A firm's profile, read as one story (story.tsx): a header that says who
// this is, its headline figures, then numbered chapters — only the ones
// there is data for — with a sticky chapter bar in place of tabs. The
// header draws from the firm's own row and one cached count read, so it
// paints at once; the figures and the chapters stream in behind it.
//
// A chapter's "see all" opens a focused page on the same URL (`?view=`),
// and an LP's asset-class card opens that class (`?class=`). The old
// `?tab=` links land on the matching view.

const VIEWS = ["people", "signals", "events", "notes", "deals", "funds", "portfolio", "providers", "clients", "peers", "commitments", "managers", "backers", "profile", "edit"] as const;
type View = (typeof VIEWS)[number];
const TAB_TO_VIEW: Record<string, View | null> = {
  overview: null,
  manager: null,
  investor: "profile",
  deals: "deals",
  funds: "funds",
  portfolio: "portfolio",
  people: "people",
  events: "events",
  providers: "providers",
  clients: "clients",
  signals: "signals",
  peers: "peers",
  notes: "notes",
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await profileCompany(id);
  return { title: company ? `${company.name} — LPGP Intelligence` : "Company — LPGP Intelligence" };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Where the firm is: city and state or country. A "city" that is a street address (a workbook quirk) is left out. */
function hqOf(c: Company): string | null {
  const city = c.city && !/^\d/.test(c.city.trim()) ? c.city : null;
  const hq = c.hq_location && !/^\d/.test(c.hq_location.trim()) ? c.hq_location : null;
  return [city, c.country === "United States" ? c.state : c.country].filter(Boolean).join(", ") || hq || c.region || null;
}

const FIRM_WORDS = /(fund|firm|manager|office|company|plan|scheme|system|foundation|endowment|insurer|bank|consultant|advis[eo]r|partnership|trust|board|corporation|agency|institution|investor|group|authority|association|platform|provider|administrator|custodian|auditor|broker|agent)s?$/i;

/** "A public pension fund based in Sacramento, founded in 1932." */
function identity(c: Company): string {
  const type = (c.sub_type ?? CATEGORIES[c.category].name.replace(/s$/, "")).trim();
  const noun = FIRM_WORDS.test(type) ? type.toLowerCase() : `${type.toLowerCase()} firm`;
  const article = /^[aeiou]/i.test(noun) ? "An" : "A";
  const place = hqOf(c);
  return `${article} ${noun}${place ? ` based in ${place}` : ""}${c.founded_year ? `, founded in ${c.founded_year}` : ""}.`;
}

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[]; view?: string | string[]; class?: string | string[]; n?: string | string[]; sort?: string | string[] }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [company, counts] = await Promise.all([profileCompany(id), getProfileCounts(id)]);
  if (!company) notFound();
  const base = `/companies/${company.id}`;
  const meta = CATEGORIES[company.category];
  const cls = one(sp.class);
  const viewParam = one(sp.view);
  const tabParam = one(sp.tab);
  const view: View | null = viewParam && (VIEWS as readonly string[]).includes(viewParam) ? (viewParam as View) : tabParam ? (TAB_TO_VIEW[tabParam] ?? null) : null;

  if (cls && company.category === "LP") {
    const shown = Number(one(sp.n)) || undefined;
    const sortParam = one(sp.sort);
    const sort: ClassSort = sortParam === "irr" || sortParam === "amount" ? sortParam : "newest";
    return (
      <StoryPage>
        <BackLink href={`${base}#invests`} label={company.name} />
        <div className="mt-5 flex items-center gap-3">
          <span className="story-logo">
            <CompanyLogo name={company.name} domain={company.domain} size={40} />
          </span>
          <span className="wordmark text-[10.5px] text-[var(--brass)]">{company.name} · Where it invests</span>
        </div>
        <Suspense fallback={<ChapterSkeleton />}>
          <ClassFocus company={company} cls={cls} base={base} shown={shown} sort={sort} />
        </Suspense>
      </StoryPage>
    );
  }

  if (view) {
    return (
      <StoryPage>
        <BackLink href={base} label={company.name} />
        <h1 className="story-name mt-4" style={{ fontSize: "clamp(24px, 3vw, 34px)" }}>
          {VIEW_TITLE[view](company)}
        </h1>
        <div className="desk mt-6">
          <Suspense fallback={<TabSkeleton />}>
            <Focus view={view} company={company} />
          </Suspense>
        </div>
      </StoryPage>
    );
  }

  const hq = hqOf(company);
  const adv = company.adv_firm_type === "ERA" ? "Exempt reporting adviser" : company.adv_firm_type === "Registered" ? "SEC-registered adviser" : null;
  const Story = company.category === "LP" ? LpStory : company.category === "GP" ? GpStory : OtherStory;

  return (
    <StoryPage>
      <BackLink href={`/database?book=${company.category}`} label={meta.name} />
      <header className="mt-5 flex flex-wrap items-start gap-x-6 gap-y-4">
        <span className="story-logo shrink-0">
          <CompanyLogo name={company.name} domain={company.domain} size={72} />
        </span>
        <div className="min-w-0 flex-1 basis-[420px]">
          <div className="wordmark text-[10.5px] text-[var(--brass)]">
            {meta.name}
            {company.sub_type ? ` · ${company.sub_type}` : ""}
          </div>
          <h1 className="story-name mt-2">{company.name}</h1>
          <p className="story-lede mt-3">
            <strong>{identity(company)}</strong> {company.description ? company.description : null}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {hq ? <Chip>{hq}</Chip> : null}
            {adv ? <Chip>{adv}</Chip> : null}
            {company.website ? (
              <a href={company.website} target="_blank" rel="noreferrer" className="story-chip hover:text-foreground">
                <Globe className="h-3 w-3" /> {company.domain ?? "Website"}
              </a>
            ) : null}
            {company.linkedin_url ? (
              <a href={company.linkedin_url} target="_blank" rel="noreferrer" className="story-chip hover:text-foreground">
                <Link2 className="h-3 w-3" /> LinkedIn
              </a>
            ) : null}
          </div>
        </div>
        <div className="w-full md:w-auto">
          <Suspense fallback={<div className="h-9" />}>
            <HeroActions company={company} />
          </Suspense>
        </div>
      </header>

      <Suspense fallback={<FiguresSkeleton />}>
        <HeroFigures company={company} counts={counts} base={base} />
      </Suspense>

      <Suspense fallback={<ChapterSkeleton />}>
        <Story company={company} counts={counts} base={base} />
      </Suspense>

      <Suspense fallback={null}>
        <SimilarChapter companyId={company.id} />
      </Suspense>

      <Suspense fallback={null}>
        <Further company={company} counts={counts} base={base} />
      </Suspense>
    </StoryPage>
  );
}

/** The end of the story: everything else on file, one tap each. */
async function Further({ company, counts, base }: { company: Company; counts: ProfileCounts; base: string }) {
  const user = await getSessionUser();
  const links: { href: string; label: string; count?: number }[] = [];
  if (company.category === "LP") {
    links.push({ href: `${base}?view=profile`, label: "Investor profile" });
    if (counts.asLpDisclosed) links.push({ href: `${base}?view=commitments`, label: "Every commitment", count: counts.asLpDisclosed });
  }
  if (company.category === "GP" && counts.asGp) links.push({ href: `${base}?view=commitments`, label: "Every LP commitment", count: counts.asGp });
  if (counts.deals) links.push({ href: `${base}?view=deals`, label: "Deals, raises and books", count: counts.deals });
  if (counts.events) links.push({ href: `${base}?view=events`, label: "Our events", count: counts.events });
  links.push({ href: `${base}?view=notes`, label: "Notes", count: counts.notes });
  links.push({ href: `${base}?view=peers`, label: "Peer benchmark" });
  if (user?.role === "admin") links.push({ href: `${base}?view=edit`, label: "Edit details" });
  return (
    <section className="chapter" aria-label="More on file">
      <div className="chapter-eyebrow">More on file</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="chapter-more">
            {l.label}
            {l.count ? <span className="figure text-[11px] text-muted-foreground">{l.count.toLocaleString("en-US")}</span> : null}
          </Link>
        ))}
      </div>
    </section>
  );
}

const VIEW_TITLE: Record<View, (c: Company) => string> = {
  people: (c) => `People at ${c.name}`,
  signals: (c) => `${c.name} in the news`,
  events: () => "Our events",
  notes: () => "Notes",
  deals: () => "Deals, raises and books",
  funds: (c) => `${c.name}'s funds`,
  portfolio: (c) => `${c.name}'s portfolio`,
  providers: () => "Service providers",
  clients: (c) => `Managers that use ${c.name}`,
  peers: () => "Peer benchmark",
  commitments: (c) => (c.category === "LP" ? `Every commitment ${c.name} has disclosed` : `Every commitment to ${c.name}'s funds`),
  managers: (c) => `Every manager ${c.name} backs`,
  backers: (c) => `Every investor backing ${c.name}`,
  profile: () => "Investor profile",
  edit: () => "Edit details",
};

async function ClassFocus({ company, cls, base, shown, sort }: { company: Company; cls: string; base: string; shown?: number; sort: ClassSort }) {
  const book = await getLpBook(company.id);
  return <LpClassView book={book} cls={cls} base={base} name={company.name} shown={shown} sort={sort} />;
}

async function Focus({ view, company }: { view: View; company: Company }) {
  switch (view) {
    case "people":
      return <PeopleTab companyId={company.id} />;
    case "signals":
      return <SignalsTab companyId={company.id} />;
    case "events":
      return <EventsTab companyId={company.id} />;
    case "notes":
      return <NotesTab companyId={company.id} />;
    case "deals":
      return <DealsTab company={company} />;
    case "funds":
      return <FundsTab company={company} />;
    case "portfolio":
      return <PortfolioTab company={company} />;
    case "providers":
      return <ProvidersTab companyId={company.id} />;
    case "profile":
      return <InvestorTab company={company} />;
    case "edit":
      return <EditTab company={company} />;
    case "clients":
    case "peers": {
      // Both read the directory index, so only these views pay for it.
      const index = await getDirectoryIndex();
      if (view === "peers") {
        const record = index.records.find((r) => r.id === company.id);
        return record ? <PeersTab record={record} /> : <p className="text-muted-foreground">This firm is not in the directory index yet.</p>;
      }
      const ranks: RoleRank[] = [];
      const brandIndex = index.brands.findIndex((b) => b.companyId === company.id);
      if (brandIndex >= 0) {
        const managers = filers(index.records);
        for (const role of PROVIDER_ROLES) {
          const league = leagueTable(managers, index.brands, role, 10_000);
          const at = league.rows.findIndex((r) => r.brandIndex === brandIndex);
          if (at >= 0) ranks.push({ role, rank: at + 1, clients: league.rows[at].clients, of: league.covered });
        }
      }
      return <ClientsTab companyId={company.id} ranks={ranks} brandKey={brandIndex >= 0 ? index.brands[brandIndex].key : null} />;
    }
    case "commitments": {
      if (company.category === "LP") {
        const book = await getLpBook(company.id);
        return <Commitments rows={book.all} as="lp" />;
      }
      const { commitments } = await getGpBackers(company.id);
      return <Commitments rows={commitments} as="gp" />;
    }
    case "managers":
      return <AllManagers company={company} />;
    case "backers":
      return <AllBackers company={company} />;
  }
}

async function AllManagers({ company }: { company: Company }) {
  const book = await getLpBook(company.id);
  const by = new Map<string, { id: string | null; name: string; n: number; irr: number[]; latest: number | null }>();
  for (const c of book.all) {
    const name = c.gp_label ?? "Manager not on file";
    const key = c.gp_company_id ?? `n:${name.toLowerCase()}`;
    const e = by.get(key) ?? { id: c.gp_company_id, name, n: 0, irr: [], latest: null };
    e.n += 1;
    if (c.net_irr != null) e.irr.push(Number(c.net_irr));
    if (c.commitment_year != null) e.latest = Math.max(e.latest ?? 0, c.commitment_year);
    by.set(key, e);
  }
  const list = [...by.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  const most = list[0]?.n ?? 1;
  return <RelationshipRows rows={list.map((m) => ({ id: m.id, name: m.name, sub: `${m.n} fund${m.n === 1 ? "" : "s"}${m.latest ? ` · latest ${m.latest}` : ""}`, share: (m.n / most) * 100, irr: m.irr }))} empty="No disclosed commitment names a manager yet." />;
}

async function AllBackers({ company }: { company: Company }) {
  const { backers } = await getGpBackers(company.id);
  const most = backers[0]?.commitments ?? 1;
  return <RelationshipRows rows={backers.map((b) => ({ id: b.id, name: b.name, domain: b.domain, sub: [b.type, `${b.funds.length || b.commitments} fund${(b.funds.length || b.commitments) === 1 ? "" : "s"}`, b.first ? `since ${b.first}` : null].filter(Boolean).join(" · "), share: (b.commitments / most) * 100, irr: b.irrs }))} empty="No LP has disclosed a commitment to this manager's funds." />;
}

function RelationshipRows({ rows, empty }: { rows: { id: string | null; name: string; domain?: string | null; sub: string; share: number; irr: number[] }[]; empty: string }) {
  if (!rows.length) return <p className="text-[14px] text-muted-foreground">{empty}</p>;
  const med = (v: number[]) => {
    const s = [...v].sort((a, b) => a - b);
    return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
  };
  return (
    <div className="story story-card story-rows overflow-hidden">
      {rows.map((r) => {
        const inner = (
          <>
            <CompanyLogo name={r.name} domain={r.domain} size={34} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium">{r.name}</span>
              <span className="block truncate text-[12px] text-muted-foreground">{r.sub}</span>
            </span>
            <span className="hidden w-[160px] sm:block">
              <Meter pct={r.share} />
            </span>
            <span className="figure w-[80px] text-right text-[12.5px] text-muted-foreground">{r.irr.length ? `${fmtPct(med(r.irr))} IRR` : ""}</span>
            {r.id ? <ArrowUpRight className="story-card-arrow h-4 w-4 shrink-0" /> : <span className="w-4" />}
          </>
        );
        return r.id ? (
          <Link key={r.id} href={`/companies/${r.id}`} className="story-row">
            {inner}
          </Link>
        ) : (
          <div key={r.name} className="story-row">
            {inner}
          </div>
        );
      })}
    </div>
  );
}
