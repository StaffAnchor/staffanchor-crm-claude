import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Finds a person to open in the call desk by phone number or name, so a call-back can be picked up straight away even if
// the person is not due on the list (for example they were called this morning and have rung back).
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner", "freelancer"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 3) return NextResponse.json({ people: [] });

  const { data } = await supabase.rpc("call_person_lookup", { p_q: q });
  const rows = (data ?? []) as { id: string }[];
  if (rows.length === 0) return NextResponse.json({ people: [] });
  const { data: extra } = await supabase.from("candidates").select("id, email, profile_group, sub_domain").in("id", rows.map((r) => r.id));
  const ex = new Map((extra ?? []).map((e) => [e.id as string, e]));
  const people = rows.map((r) => ({ ...r, resume_url: null, email: ex.get(r.id)?.email ?? null, profile_group: ex.get(r.id)?.profile_group ?? null, sub_domain: ex.get(r.id)?.sub_domain ?? null }));
  return NextResponse.json({ people });
}
