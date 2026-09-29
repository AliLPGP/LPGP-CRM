import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string | null | undefined): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) {
    const hours = Math.floor(diff / 3_600_000);
    if (hours === 0) return "just now";
    return `${hours}h ago`;
  }
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1 month ago";
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

function trimZero(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

/** "$415.9 Million", "$2.3 Billion", "$950 Thousand" — for hero figures. */
export function formatAumLong(value: number | null | undefined): string | null {
  if (value == null || Number.isNaN(value)) return null;
  const v = Math.abs(value);
  if (v >= 1_000_000_000_000) return `$${trimZero(value / 1_000_000_000_000)} Trillion`;
  if (v >= 1_000_000_000) return `$${trimZero(value / 1_000_000_000)} Billion`;
  if (v >= 1_000_000) return `$${trimZero(value / 1_000_000)} Million`;
  if (v >= 1_000) return `$${trimZero(value / 1_000)} Thousand`;
  return `$${value}`;
}

/** "$415.9M", "$2.3B", "$1.2T" — for compact contexts. */
export function formatUsd(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const v = Math.abs(value);
  if (v >= 1_000_000_000_000) return `$${trimZero(value / 1_000_000_000_000)}T`;
  if (v >= 1_000_000_000) return `$${trimZero(value / 1_000_000_000)}B`;
  if (v >= 1_000_000) return `$${trimZero(value / 1_000_000)}M`;
  if (v >= 1_000) return `$${trimZero(value / 1_000)}K`;
  return `$${value}`;
}

export function domainFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** "j.s." / "js" / "J S" → "JS". Letters only, uppercased, for matching. */
export function normalizeInitials(value: string | null | undefined): string {
  return (value ?? "").replace(/[^a-z]/gi, "").toUpperCase();
}
