import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/cv-facts";
import { checkCandidateForMandate } from "@/lib/ai-match";

// "Check against open roles": runs the matching engine for ONE candidate against the open roles they are not
// in yet, a few at a time, and stores the results as suggestions. Roles already dismissed for this person
// are not re-suggested, and results that are still current are reused without another AI call.
export const maxDuration = 300;
const PER_CLICK = 6;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const admin = getServiceClient();
  if (!admin) return NextResponse.json({ error: "Server isn't configured for matching (missing service key)." }, { status: 503 });
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY && !process.env.MISTRAL_API_KEY) {
    return NextResponse.json({ error: "AI isn't configured yet (no AI provider key on the server)." }, { status: 503 });
  }

  const [{ data: links }, { data: prior }, { data: roles }] = await Promise.all([
    admin.from("candidate_mandate_links").select("mandate_id").eq("candidate_id", id),
    admin.from("mandate_ai_matches").select("mandate_id, status, computed_at").eq("candidate_id", id),
    admin.from("mandates").select("id, role_title, must_haves").eq("status", "open").order("created_at", { ascending: false }),
  ]);
  const inPipeline = new Set(((links ?? []) as { mandate_id: string }[]).map((l) => l.mandate_id));
  const known = new Map(((prior ?? []) as { mandate_id: string; status: string }[]).map((m) => [m.mandate_id, m.status]));
  const candidates = ((roles ?? []) as { id: string; role_title: string; must_haves: unknown }[]).filter(
    (r) => !inPipeline.has(r.id) && known.get(r.id) !== "dismissed" && Array.isArray(r.must_haves) && r.must_haves.length > 0
  );
  // Roles never checked for this person go first.
  candidates.sort((a, b) => Number(known.has(a.id)) - Number(known.has(b.id)));
  const batch = candidates.slice(0, PER_CLICK);

  let checked = 0;
  let reused = 0;
  const failed: string[] = [];
  for (const r of batch) {
    const res = await checkCandidateForMandate(r.id, id, admin, { status: "suggested" });
    if (res.ok) {
      if (res.cached) reused++;
      else checked++;
    } else if (/usage limit/i.test(res.error)) {
      failed.push(res.error);
      break;
    } else {
      failed.push(`${r.role_title}: ${res.error}`);
    }
  }
  return NextResponse.json({ ok: true, openRoles: (roles ?? []).length, eligible: candidates.length, checked, reused, remaining: Math.max(0, candidates.length - batch.length), failed });
}
