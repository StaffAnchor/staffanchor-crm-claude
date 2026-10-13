import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";

// Owner-only small actions on a pipeline role: take it down, bring it back, or
// note that its post was copied.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { kind, mandateId } = (await req.json().catch(() => ({}))) as { kind?: string; mandateId?: string };
  if (!mandateId || !/^[0-9a-f-]{36}$/i.test(mandateId)) return NextResponse.json({ error: "Missing role." }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Server is missing its database key." }, { status: 503 });
  const admin = createAdmin(url, key, { auth: { persistSession: false } });

  const { data: m } = await admin.from("mandates").select("id, listing_kind").eq("id", mandateId).maybeSingle();
  if (!m || m.listing_kind !== "pipeline") return NextResponse.json({ error: "Not a pipeline role." }, { status: 404 });

  if (kind === "takedown") {
    await admin.from("mandates").update({ status: "on_hold", paused_reason: "Taken down from the Marketing page", paused_at: new Date().toISOString(), paused_by: user.id }).eq("id", mandateId);
  } else if (kind === "restore") {
    await admin.from("mandates").update({ status: "open", paused_reason: null, paused_at: null, paused_by: null }).eq("id", mandateId);
  } else if (kind === "copied") {
    await admin.from("marketing_posts").update({ copied_at: new Date().toISOString() }).eq("mandate_id", mandateId);
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
