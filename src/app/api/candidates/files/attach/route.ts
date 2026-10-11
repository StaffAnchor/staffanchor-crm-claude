import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { stillOrphaned } from "@/lib/orphan-files";

export const runtime = "nodejs";

// Attaches an unused CV file to a profile that has no CV. Never replaces an existing CV.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);

  const { path, candidateId } = (await req.json().catch(() => ({}))) as { path?: string; candidateId?: string };
  if (!path || !candidateId) return NextResponse.json({ error: "path and candidateId are required" }, { status: 400 });
  if (!(await stillOrphaned(admin, [path])).has(path)) return NextResponse.json({ error: "That file is already used or no longer unattached." }, { status: 409 });
  const { data: cand } = await admin.from("candidates").select("id, full_name, resume_file_url").eq("id", candidateId).maybeSingle();
  if (!cand) return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  if (cand.resume_file_url) return NextResponse.json({ error: `${cand.full_name ?? "That profile"} already has a CV.` }, { status: 409 });
  const { error } = await admin.from("candidates").update({ resume_file_url: path, updated_at: new Date().toISOString() }).eq("id", candidateId).is("resume_file_url", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("audit_log").insert({ actor: user.id, action: "orphan_cv_attached", entity: "candidate", entity_id: candidateId, detail: { path } });
  return NextResponse.json({ ok: true });
}
