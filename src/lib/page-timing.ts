import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** Records how long a page took to build, after the response is sent. Shown to the admin on the Scorecard. */
export function recordTiming(route: string, startedAt: number) {
  const ms = Date.now() - startedAt;
  after(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;
    await createClient(url, key, { auth: { persistSession: false } }).from("page_timings").insert({ route, ms }).then(() => {}, () => {});
  });
}
