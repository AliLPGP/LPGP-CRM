import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/auth";

// UI text — a geometric grotesque with more character than the usual default.
const sans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// Every number in the app — tabular so columns line up.
const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "LPGP Connect — Sales CRM",
  description:
    "Sales CRM for LPGP Connect — pipeline, call workspace, sponsor accounts and a private-markets intelligence database, wired to the ops panel.",
};

// Applied before paint so a dark-mode reload never flashes white.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} antialiased`}
      // The theme script sets `dark` on this element before React hydrates.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">
        <AppShell user={user}>{children}</AppShell>
      </body>
    </html>
  );
}
