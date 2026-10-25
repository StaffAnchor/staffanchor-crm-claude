import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { generateBrief } from "@/lib/candidate-brief";

export const runtime = "nodejs";
export const maxDuration = 120;

const BATCH = 4;

// Writes the client brief for shortlisted people on this role who do not have one yet (a few at a time, so the request
// finishes). It only writes the drafts; nothing is shown to a client until a recruiter approves each one.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Missing role." }, { status: 400 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createAdmin(url, key, { auth: { persistSession: false } });

  const { data: links } = await admin.from("candidate_mandate_links").select("candidate_id").eq("mandate_id", id).eq("in_shortlist", true);
  const ids = ((links ?? []) as { candidate_id: string }[]).map((l) => l.candidate_id);
  if (ids.length === 0) return NextResponse.json({ ok: true, written: 0, remaining: 0 });
  const { data: have } = await admin.from("candidate_briefs").select("candidate_id").in("candidate_id", ids);
  const haveSet = new Set(((have ?? []) as { candidate_id: string }[]).map((h) => h.candidate_id));
  const missing = ids.filter((c) => !haveSet.has(c));

  let written = 0;
  let firstError: string | null = null;
  for (const c of missing.slice(0, BATCH)) {
    const r = await generateBrief(admin, c);
    if (r.ok) written++;
    else firstError = firstError ?? r.error;
  }
  return NextResponse.json({ ok: true, written, remaining: Math.max(0, missing.length - written), error: firstError });
}
