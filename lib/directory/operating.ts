// Operating partners: the operators a GP brings into its portfolio companies
// — operating partners, operating executives, executive partners, value-
// creation and portfolio-operations leads. They're contacts at the GP like
// anyone else; this is how a title is recognised as one, so every screen and
// the Lusha lookup agree on who counts.
//
// Pure module: safe on the client.

/** Titles asked of Lusha. It matches loosely, so results are re-checked below. */
export const OPERATING_TITLES = [
  "Operating Partner",
  "Operating Executive",
  "Executive Partner",
  "Operating Advisor",
  "Operating Principal",
  "Operating Director",
  "Value Creation",
  "Portfolio Operations",
];

const OPERATING_RE =
  /\boperating\s+(partner|executive|advis[eo]r|principal|director|group|team)\b|\bexecutive\s+partner\b|\bvalue[\s-]+creation\b|\bportfolio\s+(operations|support|value)\b|\bportfolio\s+company\s+(operations|support)\b/i;

/** "Senior Operating Partner, Digital" → true; "Partner and Chief Operating Officer" → false. */
export function isOperatingRole(title: string | null | undefined): boolean {
  return Boolean(title && OPERATING_RE.test(title));
}
