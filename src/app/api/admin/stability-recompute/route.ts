import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/cv-facts";
import { computeStabilityScore, mergeTimelines, type ProfileTimelineEntry, type ResumeTimelineEntry } from "@/lib/career-timeline";

// Recomputes every candidate's stability score from their saved career
// timeline using the current rule (roles at the same employer count as one
// stay). Pure arithmetic on data already stored: no AI call, no cost.
export const maxDuration = 120;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") return { error: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
  return { supabase };
}

export async function POST() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const admin = getServiceClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 503 });

  const PAGE = 500;
  let checked = 0;
  let changed = 0;
  let filled = 0;
  const examples: { id: string; from: number | null; to: number | null }[] = [];

  for (let offset = 0; offset < 20000; offset += PAGE) {
    const { data, error } = await admin
      .from("candidates")
      .select("id, stability_score, career_timeline_profile, career_timeline_resume")
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = data ?? [];
    for (const r of rows) {
      const profileEntries = (r.career_timeline_profile ?? []) as ProfileTimelineEntry[];
      const resumeEntries = (r.career_timeline_resume ?? []) as ResumeTimelineEntry[];
      if (profileEntries.length === 0 && resumeEntries.length === 0) continue;
      checked++;
      const next = computeStabilityScore(mergeTimelines(profileEntries, resumeEntries))?.score ?? null;
      const prev = (r.stability_score as number | null) ?? null;
      if (next === prev) continue;
      if (next === null) continue; // never wipe an existing score
      const { error: upErr } = await admin.from("candidates").update({ stability_score: next }).eq("id", r.id);
      if (upErr) continue;
      changed++;
      if (prev === null) filled++;
      if (examples.length < 5) examples.push({ id: r.id as string, from: prev, to: next });
    }
    if (rows.length < PAGE) break;
  }
  return NextResponse.json({ ok: true, checked, changed, filled, examples });
}
