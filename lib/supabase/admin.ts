import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Writes get a longer leash than reads (imports do several round-trips),
// but still abort rather than hang a serverless function to its limit.
const FETCH_TIMEOUT_MS = 15000;
const fetchWithTimeout: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

/** True when the service-role key (needed for writes) is present. */
export function isAdminConfigured(): boolean {
  return Boolean(url && serviceKey);
}

/**
 * Service-role Supabase client for server-side WRITES (lead import, profile
 * edits, notes). Bypasses RLS — never import this into client code.
 * Returns null when not configured.
 */
export function getAdminClient(): SupabaseClient | null {
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithTimeout },
  });
}
