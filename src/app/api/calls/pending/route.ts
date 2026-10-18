import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// The latest call this person started and has not yet said how it went, from the last 6 hours.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ call: null });
  const since = new Date(Date.now() - 6 * 3_600_000).toISOString();
  const { data } = await supabase
    .from("call_logs")
    .select("id, started_at, candidate_id, mandate_id, candidates(full_name), mandates(role_title)")
    .eq("recruiter_id", user.id)
    .is("finished_at", null)
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return NextResponse.json({ call: null });
  const cand = data.candidates as unknown as { full_name: string | null } | { full_name: string | null }[] | null;
  const mand = data.mandates as unknown as { role_title: string | null } | { role_title: string | null }[] | null;
  return NextResponse.json({
    call: {
      id: data.id,
      startedAt: data.started_at,
      candidateId: data.candidate_id,
      candidateName: (Array.isArray(cand) ? cand[0] : cand)?.full_name ?? null,
      mandateId: data.mandate_id,
      role: (Array.isArray(mand) ? mand[0] : mand)?.role_title ?? null,
    },
  });
}
