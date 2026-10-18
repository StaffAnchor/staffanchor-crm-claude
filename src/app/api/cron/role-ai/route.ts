import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { withHeartbeat } from "@/lib/cron-heartbeat";
import { classifyBatch } from "@/lib/role-classifier";

// Nightly: classify anyone new (or not yet classified) by what they actually do, a batch at a time.
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
  // Keep going in batches until the queue is empty or the time is nearly up, so a backlog clears in days, not weeks.
  const started = Date.now();
  let processed = 0;
  let written = 0;
  let remaining = 0;
  for (let i = 0; i < 6 && Date.now() - started < 35_000; i++) {
    const r = await classifyBatch(admin, "missing", 45);
    if (!r.ok) return NextResponse.json(r);
    processed += r.processed;
    written += r.written;
    remaining = r.remaining;
    if (r.processed === 0 || r.remaining === 0) break;
  }
  return NextResponse.json({ ok: true, processed, written, remaining });
}

export const GET = withHeartbeat("role-ai", 24 * 60, handler);
