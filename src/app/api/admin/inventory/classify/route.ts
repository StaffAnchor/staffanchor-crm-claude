import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { classifyBatch } from "@/lib/role-classifier";

export const runtime = "nodejs";
export const maxDuration = 60;

// Admin only: classify the next batch of people by what they actually do. The page calls this repeatedly until none are left.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || me.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createAdmin(url, key, { auth: { persistSession: false } });

  const body = (await req.json().catch(() => ({}))) as { mode?: string; countOnly?: boolean };
  const mode = body.mode === "all" || body.mode === "unclear" ? body.mode : "missing";
  if (body.countOnly) {
    const { data } = await admin.rpc("ai_role_queue_count", { p_mode: mode });
    return NextResponse.json({ ok: true, remaining: Number(data ?? 0) });
  }
  const r = await classifyBatch(admin, mode, 45);
  return NextResponse.json(r.ok ? r : { ok: false, error: r.error });
}
