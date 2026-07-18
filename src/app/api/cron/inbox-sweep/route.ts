import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Daily sweep for the Priority Actions Inbox (v2): covers everything that's
// date/threshold-based rather than event-driven -- interview reminders,
// stale candidates, missing assessments, stale mandates, post-placement
// check-ins, and overdue client feedback. All the actual logic (including
// dedupe against existing open/snoozed items) lives in the
// sweep_recruiter_inbox() SQL function so it's one auditable place to
// adjust thresholds; this route is just the scheduled trigger, mirroring
// the existing auto-summarize/client-followup crons.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 503 });
  }

  const admin = createSupabaseClient(supabaseUrl, serviceKey);
  const { data, error } = await admin.rpc("sweep_recruiter_inbox");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...data });
}
