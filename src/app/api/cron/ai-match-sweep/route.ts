import { NextRequest, NextResponse } from "next/server";
import { withHeartbeat } from "@/lib/cron-heartbeat";
import { getServiceClient } from "@/lib/cv-facts";
import { runAiMatchForMandate, specHashOf, cleanList, type RoleForMatch } from "@/lib/ai-match";

// Daily: keeps every open role's AI matches fresh. A role is re-checked when
// it has never been matched, its requirements changed, or new CVs have been
// read since its last run. A few roles per day, so one run stays in budget.
export const maxDuration = 300;
const ROLES_PER_RUN = 3;

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = getServiceClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 503 });
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ ok: true, processed: 0, note: "GEMINI_API_KEY not configured" });

  const { data: roles } = await admin
    .from("mandates")
    .select("id, role_title, status, must_haves, good_to_haves, experience_min, experience_max, cities, city, ai_match_last_run_at, ai_match_spec_hash")
    .eq("status", "open")
    .eq("is_archived", false);

  const due: string[] = [];
  for (const m of (roles ?? []) as (RoleForMatch & { ai_match_last_run_at: string | null; ai_match_spec_hash: string | null })[]) {
    if (cleanList(m.must_haves).length === 0) continue;
    const specChanged = m.ai_match_spec_hash !== specHashOf(m);
    let newFacts = false;
    if (!specChanged && m.ai_match_last_run_at) {
      const { count } = await admin.from("candidate_cv_facts").select("candidate_id", { count: "exact", head: true }).gt("extracted_at", m.ai_match_last_run_at);
      newFacts = (count ?? 0) > 0;
    }
    if (!m.ai_match_last_run_at || specChanged || newFacts) due.push(m.id);
  }

  const results = [];
  for (const id of due.slice(0, ROLES_PER_RUN)) {
    results.push({ id, ...(await runAiMatchForMandate(id, admin)) });
  }
  return NextResponse.json({ ok: true, due: due.length, processed: results.length, results });
}

export const GET = withHeartbeat("ai-match-sweep", 1440, handler);
