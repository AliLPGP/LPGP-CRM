"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { MobileTabs } from "@/components/mobile-tabs";
import { SiteFooter } from "@/components/site-footer";
import { CommandPalette } from "@/components/command-palette";
import type { SessionUser } from "@/lib/auth";

export function AppShell({
  user,
  children,
}: {
  user: SessionUser | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const accent = sectionAccent(pathname);
  // The frame carries the accent for everything it draws; <html> carries it
  // too, for menus and dialogs that portal out of the frame.
  useEffect(() => {
    const root = document.documentElement;
    if (accent) root.dataset.accent = accent;
    else delete root.dataset.accent;
  }, [accent]);
  // The login page renders bare (no header/footer).
  if (pathname === "/login") return <>{children}</>;

  // A web product's frame: the header across the top, the page below it, and
  // on a phone the tab bar along the bottom — the frame pads for it, so the
  // footer and the last row never sit under it.
  return (
    <div className="app-frame flex min-h-screen flex-col" data-accent={accent ?? undefined}>
      <TopNav user={user} />
      <main className="w-full flex-1">{children}</main>
      <SiteFooter />
      <MobileTabs />
      <CommandPalette />
    </div>
  );
}

/** The section accent a path wears: the sports desk is green, the rest blue. */
function sectionAccent(pathname: string): "sports" | null {
  return pathname === "/database/sports" || pathname.startsWith("/database/sports/") || pathname === "/database/asset-classes/sports" ? "sports" : null;
}
