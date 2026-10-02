import type { CSSProperties } from "react";

/**
 * The one entrance the CRM uses for a panel, a menu or a tab's content: a
 * 160 ms ease-out fade with a 4px rise, reusing the `topnav-in` keyframes in
 * globals.css. Spread onto the element; `motion-reduce:animate-none` honours
 * the reader's preference. Nothing bounces and nothing scales.
 */
export const fadeIn: { className: string; style: CSSProperties } = {
  className: "motion-reduce:animate-none",
  style: { animation: "topnav-in 160ms ease-out both" },
};
