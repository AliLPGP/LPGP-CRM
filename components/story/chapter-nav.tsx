"use client";

import { useEffect, useState } from "react";

export type ChapterLink = { id: string; label: string; count?: number | string | null };

/**
 * The chapter bar: sticky under the header, one pill per chapter, the one
 * in view filled. A pill scrolls its chapter into view; the page stays one
 * document, so the back button and a shared link behave as a reader expects.
 */
export function ChapterNav({ chapters }: { chapters: ChapterLink[] }) {
  const [active, setActive] = useState<string | null>(chapters[0]?.id ?? null);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      // The last chapter whose top has passed the line under the bar.
      let current = chapters[0]?.id ?? null;
      for (const c of chapters) {
        const el = document.getElementById(c.id);
        if (el && el.getBoundingClientRect().top <= 140) current = c.id;
      }
      // At the very bottom the last chapter is the one being read.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = chapters[chapters.length - 1]?.id ?? current;
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [chapters]);

  if (chapters.length < 2) return null;
  return (
    <nav className="chapter-nav mt-8" aria-label="Chapters">
      <div className="chapter-nav-row">
        {chapters.map((c) => (
          <a
            key={c.id}
            href={`#${c.id}`}
            className="chapter-pill"
            aria-current={active === c.id ? "true" : undefined}
            onClick={(e) => {
              const el = document.getElementById(c.id);
              if (!el) return;
              e.preventDefault();
              const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
              window.history.replaceState(null, "", `#${c.id}`);
            }}
          >
            {c.label}
            {c.count != null ? <span className="chapter-pill-count">{typeof c.count === "number" ? c.count.toLocaleString("en-US") : c.count}</span> : null}
          </a>
        ))}
      </div>
    </nav>
  );
}
