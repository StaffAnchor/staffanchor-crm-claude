import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { checkEmailReplies } from "@/lib/email-replies";
import { withHeartbeat } from "@/lib/cron-heartbeat";

export const maxDuration = 120;

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 503 });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
  const r = await checkEmailReplies(admin, { sinceDays: 3 });
  return NextResponse.json(r, { status: r.ok ? 200 : 502 });
}

export const GET = withHeartbeat("read-email-replies", 1440, handler);
