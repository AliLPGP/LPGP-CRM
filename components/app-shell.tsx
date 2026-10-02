"use client";

import { usePathname } from "next/navigation";
import { TopNav } from "@/components/top-nav";
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

  // A web product's frame: the header across the top, the page below it.
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav user={user} />
      <main className="w-full flex-1">{children}</main>
      <SiteFooter />
      <CommandPalette />
    </div>
  );
}
