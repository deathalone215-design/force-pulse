import { createClient } from "@supabase/supabase-js";

let browserClient = null;
let browserClientChecked = false;

function resolveBrowserEnv() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL ||
    "";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    "";
  return { url, key };
}

/**
 * Browser Supabase client for Realtime live-board push.
 * Uses publishable/anon key only — never the service role.
 */
export function getSupabaseBrowser() {
  if (browserClientChecked) return browserClient;
  browserClientChecked = true;
  const { url, key } = resolveBrowserEnv();
  if (!url || !key) {
    browserClient = null;
    return null;
  }
  browserClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });
  return browserClient;
}

export function hasSupabaseRealtimeEnv() {
  const { url, key } = resolveBrowserEnv();
  return !!(url && key);
}
