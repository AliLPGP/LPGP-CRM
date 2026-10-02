import Link from "next/link";

// A page that is not on file, said the way the desk says it: one line, and
// the way back.
export default function NotFound() {
  return (
    <div className="desk mx-auto flex min-h-[60vh] max-w-[1480px] flex-col items-center justify-center px-4 py-16 text-center md:px-6">
      <p className="wordmark text-[10px] text-brass">404</p>
      <h1 className="display mt-2 text-[22px] leading-tight md:text-[26px]">Nothing on file at this address.</h1>
      <Link href="/database" className="mt-5 inline-flex h-8 items-center rounded-[4px] border bg-card px-3 text-[12.5px] transition-colors hover:bg-accent">
        Back to the overview
      </Link>
    </div>
  );
}
