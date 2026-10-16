import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// The companies the owner rates. Admin only; recruiters can read them on the pool page.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || me.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { targets?: unknown };
  const targets = (Array.isArray(body.targets) ? body.targets : [])
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 150);
  const { error } = await supabase.from("talent_pool_settings").upsert({ key: "target_companies", value: targets, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: "Couldn't save." }, { status: 500 });
  return NextResponse.json({ ok: true, count: targets.length });
}
