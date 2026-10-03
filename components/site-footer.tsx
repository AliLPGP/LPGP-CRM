export function SiteFooter() {
  // The same measure as the header, so the page's edges line up top and bottom.
  return (
    <footer className="mt-16 border-t" data-no-print>
      <div className="mx-auto flex max-w-[1480px] flex-col items-start justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center md:px-6">
        <p>
          <span className="font-medium text-foreground">LPGP Intelligence</span> — private markets intelligence: investors, fund managers, funds, performance, service providers, deals.
        </p>
        <p className="text-xs">Every figure carries the page that states it.</p>
      </div>
    </footer>
  );
}
