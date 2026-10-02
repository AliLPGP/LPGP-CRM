import type { Metadata, Viewport } from "next";
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
  // Installable on a phone: the manifest (app/manifest.ts), the home-screen
  // icon and the iOS web-app tags. The status bar is translucent over the
  // black rail, so the app reads edge to edge under the notch.
  manifest: "/manifest.webmanifest",
  icons: { apple: "/icons/apple-touch-icon-180.png" },
  appleWebApp: { capable: true, title: "LPGP", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Both modes keep the black rail along the top, so the browser chrome matches it in either.
  themeColor: "#000000",
  // The page runs under the notch and the home indicator; the bottom tab bar pads for them.
  viewportFit: "cover",
};

// Applied before paint so a reload never flashes the other mode. Dark is the
// product's own register: a stored choice wins, otherwise the page is dark.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');document.documentElement.classList.toggle('dark',t!=='light');}catch(e){document.documentElement.classList.add('dark');}})();`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} dark antialiased`}
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
