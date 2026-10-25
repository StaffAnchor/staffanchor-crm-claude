import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { withHeartbeat } from "@/lib/cron-heartbeat";
import { fillMissingRoleCards } from "@/lib/role-card";

// Daily: open roles that have a type and level but no role card get one, so matching can rank people for them.
export const maxDuration = 120;

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 503 });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
  const made = await fillMissingRoleCards(admin, 8);
  return NextResponse.json({ ok: true, made });
}

export const GET = withHeartbeat("role-cards", 24 * 60, handler);
