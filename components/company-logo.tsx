"use client";

import { useState } from "react";
import { initials } from "@/lib/utils";

// Logo sources tried in turn. Clearbit gives proper logos where it still
// answers; DuckDuckGo's favicon service covers most of the rest and returns a
// real 404 for unknown domains, so the initials fallback still shows.
const SOURCES = [
  (d: string) => `https://logo.clearbit.com/${d}`,
  (d: string) => `https://icons.duckduckgo.com/ip3/${d}.ico`,
];

type LogoState = { domain: string | undefined; attempt: number; loaded: boolean };

/** Company avatar: the firm's logo by domain, tinted initials until one loads. */
export function CompanyLogo({
  name,
  domain,
  size = 40,
}: {
  name: string;
  domain?: string | null;
  size?: number;
}) {
  const clean = domain?.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  // Keyed by domain, so the same slot showing another firm starts fresh.
  const [state, setState] = useState<LogoState>({ domain: clean, attempt: 0, loaded: false });
  const current = state.domain === clean ? state : { domain: clean, attempt: 0, loaded: false };
  const src = clean && current.attempt < SOURCES.length ? SOURCES[current.attempt](clean) : null;

  return (
    // The box is sized here, in the one style the register reads, before any
    // image arrives: a logo that lands late never moves the row.
    <span
      className="relative inline-grid place-items-center overflow-hidden rounded-md border bg-secondary text-secondary-foreground font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    >
      <span aria-hidden>{initials(name)}</span>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          width={size}
          height={size}
          // Hidden until it has actually loaded: no broken-image flash while a
          // source fails over to the next one.
          className={`absolute inset-0 h-full w-full bg-white object-contain p-[8%] transition-opacity ${current.loaded ? "opacity-100" : "opacity-0"}`}
          // Off-screen rows do not fetch; decoding stays off the main thread;
          // the logo host never learns which record was being read.
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setState({ domain: clean, attempt: current.attempt, loaded: true })}
          onError={() => setState({ domain: clean, attempt: current.attempt + 1, loaded: false })}
        />
      ) : null}
    </span>
  );
}
