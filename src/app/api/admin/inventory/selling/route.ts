import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { readSellingProfiles } from "@/lib/selling-profile";

export const runtime = "nodejs";
export const maxDuration = 60;

// Admin only: read the next batch of people's selling profiles. The page calls this until nobody is left.
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
  const body = (await req.json().catch(() => ({}))) as { countOnly?: boolean };
  if (body.countOnly) {
    const { data } = await admin.rpc("ai_selling_queue_count");
    return NextResponse.json({ ok: true, remaining: Number(data ?? 0) });
  }
  const r = await readSellingProfiles(admin, 36);
  return NextResponse.json(r);
}
