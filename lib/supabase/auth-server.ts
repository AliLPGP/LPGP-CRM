import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Abort any Supabase call that takes longer than this — a paused/unreachable
// project must degrade gracefully, never hang a render until the 504 limit.
const FETCH_TIMEOUT_MS = 8000;
const fetchWithTimeout: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

export function authConfigured(): boolean {
  return Boolean(url && anon);
}

/**
 * Cookie-aware Supabase client for server components / actions. Carries the
 * signed-in user's session so RLS + auth.getUser() work. Returns null when
 * Supabase isn't configured (app then runs open + shows a setup notice).
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  if (!url || !anon) return null;
  const cookieStore = await cookies();
  return createServerClient(url, anon, {
    global: { fetch: fetchWithTimeout },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component render — safe to ignore; the
          // middleware refreshes the session cookie.
        }
      },
    },
  });
}
