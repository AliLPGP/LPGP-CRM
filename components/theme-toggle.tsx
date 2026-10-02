"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

// The current theme lives on <html class="dark">. We read it with
// useSyncExternalStore so there's no setState-in-effect and no hydration
// mismatch — the no-flash script in the layout sets the initial class.
function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("themechange", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("themechange", cb);
    window.removeEventListener("storage", cb);
  };
}

function getSnapshot(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

function getServerSnapshot(): boolean {
  return false;
}

function setTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem("theme", dark ? "dark" : "light");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("themechange"));
}

export function ThemeToggle({ variant = "rail" }: { variant?: "rail" | "switch" }) {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (variant === "switch") {
    return (
      <button
        type="button"
        onClick={() => setTheme(!isDark)}
        aria-label="Toggle dark mode"
        className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium hover:bg-accent"
      >
        {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        {isDark ? "Dark" : "Light"} mode
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(!isDark)}
      aria-label="Toggle dark mode"
      className="rail-line flex w-full items-center justify-between rounded-lg border bg-[#0b0b0c] px-2.5 py-2 text-[13px] font-medium text-[var(--rail-fg)] transition-colors hover:bg-[var(--rail-hover)] hover:text-white"
    >
      <span className="flex items-center gap-2.5">
        {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        {isDark ? "Dark" : "Light"}
      </span>
      <span
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors",
          isDark ? "bg-[var(--primary)]" : "bg-white/20",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
            isDark ? "left-[1.125rem]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}
