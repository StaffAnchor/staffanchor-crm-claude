import { createClient } from "@supabase/supabase-js";

// Global AI kill switch. An admin flips it on Analytics -> Flow & AI; it is
// stored in app_config under key "ai_paused". While paused, every AI call
// (text, file reading, embeddings) is refused before it leaves the server,
// so suggestions stop appearing and no tokens are spent. Callers already
// treat a thrown AI error as "skip and carry on".
//
// Fails OPEN: if the flag can't be read (no env, DB hiccup) AI keeps working,
// because a broken lookup must not silently take matching down.

export const AI_PAUSED_MESSAGE = "AI is paused by an admin";

let cache: { paused: boolean; at: number } | null = null;
const TTL_MS = 15_000;

export async function isAiPaused(): Promise<boolean> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.paused;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return false;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data, error } = await admin.from("app_config").select("value").eq("key", "ai_paused").maybeSingle();
    if (error) return false;
    const paused = Boolean((data?.value as { paused?: boolean } | null)?.paused);
    cache = { paused, at: now };
    return paused;
  } catch {
    return false;
  }
}

export function clearAiPausedCache(): void {
  cache = null;
}

export async function assertAiNotPaused(): Promise<void> {
  if (await isAiPaused()) throw new Error(AI_PAUSED_MESSAGE);
}
