"use client";

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
  // The login page renders bare (no header/footer).
  if (pathname === "/login") return <>{children}</>;

  // A web product's frame: the header across the top, the page below it, and
  // on a phone the tab bar along the bottom — the frame pads for it, so the
  // footer and the last row never sit under it.
  return (
    <div className="app-frame flex min-h-screen flex-col">
      <TopNav user={user} />
      <main className="w-full flex-1">{children}</main>
      <SiteFooter />
      <MobileTabs />
      <CommandPalette />
    </div>
  );
}
