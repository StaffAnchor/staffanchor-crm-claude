import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

// Admin only: rebuild the Talent Inventory now instead of waiting for the nightly run.
export async function POST() {
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
  const { data, error } = await admin.rpc("refresh_role_tags");
  if (error) return NextResponse.json({ error: "Couldn't rebuild the inventory." }, { status: 500 });
  return NextResponse.json({ ok: true, tags: data });
}
