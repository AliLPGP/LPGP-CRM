import type { Category } from "./types";

export type CategoryMeta = {
  key: Category;
  label: string; // short label, e.g. "LPs"
  singular: string; // e.g. "LP"
  name: string; // full name
  blurb: string;
  subTypes: string[];
  // Tailwind utility classes for the accent treatment of this book.
  accent: string; // text + bg chip
  dot: string; // bg dot
};

export const CATEGORIES: Record<Category, CategoryMeta> = {
  LP: {
    key: "LP",
    label: "LPs",
    singular: "LP",
    name: "Limited Partners",
    blurb:
      "Institutional investors — insurers, foundations, endowments, pension & superannuation funds, multi-family offices.",
    subTypes: [
      "Public pension fund",
      "Corporate pension fund",
      "Sovereign wealth fund",
      "Insurance company",
      "Endowment",
      "Foundation",
      "Family office",
      "Multi-family office",
      "Investment consultant",
      "Fund of funds",
      "Development finance institution",
      "Asset manager",
      "Bank",
      "Government agency",
      "Pension fund",
      "Superannuation scheme",
      "Other",
    ],
    accent: "bg-secondary text-foreground/80 border-border",
    dot: "bg-foreground/30",
  },
  GP: {
    key: "GP",
    label: "GPs",
    singular: "GP",
    name: "General Partners",
    blurb:
      "Fund managers — private equity & asset managers (BlackRock, Ares, Oaktree) and venture capital firms.",
    subTypes: [
      "Private equity",
      "Growth equity",
      "Venture capital",
      "Private credit",
      "Real estate",
      "Infrastructure",
      "Multi-asset alternatives",
      "Fund of funds & secondaries",
      "Hedge fund",
      "Asset manager",
      "Family office",
      "Bank",
      "Development finance",
      "Real assets",
      "Other",
    ],
    accent: "bg-secondary text-foreground/80 border-border",
    dot: "bg-foreground/55",
  },
  SP: {
    key: "SP",
    label: "SPs",
    singular: "SP",
    name: "Solution Providers",
    blurb:
      "Vendors to the industry — audit & advisory (KPMG), banks (MUFG), fund administrators (Apex), law firms (Kirkland & Ellis).",
    subTypes: [
      "Fund administrator",
      "Audit & advisory",
      "Law firm",
      "Bank",
      "Placement agent",
      "Technology vendor",
      "Consulting",
      "Research & analytics",
      "Valuation & ratings",
      "FX & treasury",
      "Talent & search",
      "Industry body",
    ],
    accent: "bg-secondary text-foreground/80 border-border",
    dot: "bg-foreground/85",
  },
  UN: {
    key: "UN",
    label: "Unclassified",
    singular: "UN",
    name: "Unclassified",
    blurb:
      "Firms the Master Directory hasn't placed in a book yet — classify them from their profile.",
    subTypes: [],
    accent: "bg-transparent text-muted-foreground border-dashed border-border",
    dot: "bg-transparent ring-1 ring-foreground/40",
  },
};

/** The three books people sell into. Pickers and imports offer these. */
export const CATEGORY_ORDER: Category[] = ["LP", "GP", "SP"];

/** Every book the directory holds, unclassified last. */
export const DIRECTORY_BOOKS: Category[] = ["LP", "GP", "SP", "UN"];

export function isCategory(value: unknown): value is Category {
  return value === "LP" || value === "GP" || value === "SP" || value === "UN";
}

// Sensible default Lusha job-title filters per book — senior decision-makers
// in finance. The user can override these in the import tool.
export const DEFAULT_TITLE_PRESETS: string[] = [
  "Chief Executive Officer",
  "Chief Investment Officer",
  "Chief Financial Officer",
  "Chief Operating Officer",
  "Managing Director",
  "Managing Partner",
  "General Partner",
  "Partner",
  "Head of Investments",
  "Head of Private Markets",
  "Head of Private Equity",
  "Head of Real Assets",
  "Portfolio Manager",
  "Investment Director",
];
