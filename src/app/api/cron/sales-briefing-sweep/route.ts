import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { withHeartbeat } from "@/lib/cron-heartbeat";

// Daily sweep for the Sales module's "Today's Briefing" -- the client-
// acquisition equivalent of the Priority Actions Inbox sweep. Covers
// overdue lead follow-ups, leads gone quiet with no next step scheduled,
// referral asks due at the 30/60-day placement mark, and existing clients
// due for a quarterly check-in. All the logic (including dedupe against
// existing open/snoozed items) lives in sweep_sales_briefing() so it's one
// auditable place to adjust thresholds; this route is just the scheduled
// trigger, mirroring inbox-sweep/route.ts.
export const maxDuration = 60;

async function handler(req: NextRequest) {
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
  const { data, error } = await admin.rpc("sweep_sales_briefing");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...data });
}

export const GET = withHeartbeat("sales-briefing-sweep", 1440, handler);
