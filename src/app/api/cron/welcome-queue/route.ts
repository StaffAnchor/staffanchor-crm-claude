import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { dailyCap } from "@/lib/outreach";
import { sendQueuedWelcomes } from "@/lib/welcome-queue";
import { withHeartbeat } from "@/lib/cron-heartbeat";

export const maxDuration = 300;

// Once a day (10:00 IST): sends queued "confirm your profile" emails for bulk-uploaded profiles, up to
// what is left of the shared daily limit. A recruiter can also drain the same queue any time from the
// Send button on the Outreach page.
async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 503 });
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return NextResponse.json({ ok: true, note: "Email not configured; nothing sent." });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);

  const { data: stats } = await admin.rpc("outreach_stats");
  const s = (stats ?? {}) as { sent_24h?: number; first_sent_at?: string | null };
  const room = Math.max(0, dailyCap(s.first_sent_at ?? null, new Date().getTime()) - (s.sent_24h ?? 0));
  if (room <= 0) return NextResponse.json({ ok: true, note: "Daily limit reached; will resume as it frees up." });

  const r = await sendQueuedWelcomes(admin, Math.min(room, 60));
  return NextResponse.json({ ok: true, ...r });
}

export const GET = withHeartbeat("welcome-queue", 1440, handler);
