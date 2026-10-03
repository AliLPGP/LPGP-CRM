/**
 * The LPGP mark: a rounded hexagon with a cube-face window on its left and a
 * diagonal cut that separates the right slab, drawn as inline SVG so it takes
 * `currentColor` (white on the black rail, black on a light surface).
 *
 * The geometry is traced from the brand's own asset (the site redesign's
 * header); `public/icons/icon.svg` carries the same drawing on black for the
 * favicon and the installable app's icons.
 */
export function LpgpMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="LPGP" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <mask id="lpgp-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          {/* the hexagon, corners rounded by the stroke */}
          <path d="M50 8 88 29V71L50 92 12 71V29Z" fill="#fff" stroke="#fff" strokeWidth="9" strokeLinejoin="round" />
          {/* the cube-face window */}
          <path d="M35 33 59 46V65L35 78Z" fill="#000" stroke="#000" strokeWidth="4" strokeLinejoin="round" />
          {/* the diagonal cut */}
          <path d="M53 7 88 76" stroke="#000" strokeWidth="7" strokeLinecap="round" />
        </mask>
      </defs>
      <rect width="100" height="100" fill="currentColor" mask="url(#lpgp-cut)" />
    </svg>
  );
}

/** Mark + wordmark, for the rail and the login screen. */
export function LpgpLockup({ className }: { className?: string }) {
  return (
    <span className={className}>
      <LpgpMark className="h-full w-auto" />
    </span>
  );
}
