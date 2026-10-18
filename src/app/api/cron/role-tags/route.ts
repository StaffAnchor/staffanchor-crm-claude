import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { withHeartbeat } from "@/lib/cron-heartbeat";
import { queueProactiveMatchesForCandidate } from "@/lib/proactive-match";

// Nightly: rebuild the Talent Inventory (every person's kind of role and city) from the CVs read so far.
export const maxDuration = 60;

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 503 });
  const admin = createSupabaseClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc("refresh_role_tags");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Group and sub-group follow the tags, so they are refreshed straight after.
  const { data: regrouped } = await admin.rpc("refresh_sub_groups");
  // Anyone who became match-ready in the last two days is checked against every open role now, not on the weekly sweep.
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const { data: newlyReady } = await admin.from("candidates").select("id").eq("readiness_tier", "ready").gte("readiness_updated_at", since).limit(150);
  let queued = 0;
  for (const c of (newlyReady ?? []) as { id: string }[]) {
    await queueProactiveMatchesForCandidate(c.id, admin).catch(() => {});
    queued++;
  }
  return NextResponse.json({ ok: true, tags: data, regrouped, newlyReady: queued });
}

export const GET = withHeartbeat("role-tags", 24 * 60, handler);
