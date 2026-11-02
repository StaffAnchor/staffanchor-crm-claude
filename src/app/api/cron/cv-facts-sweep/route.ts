import { NextRequest, NextResponse } from "next/server";
import { withHeartbeat } from "@/lib/cron-heartbeat";
import { extractCvFactsForCandidate, getServiceClient, pickCandidatesForCvFacts, pickCandidatesNeedingOwnership } from "@/lib/cv-facts";

// Daily catch-all: reads the CV of any recent candidate that has not been
// read yet (new CVs are normally read the moment their summary is made;
// this picks up anything that slipped through, such as a failed AI call).
export const maxDuration = 300;
const BATCH = 25;
const CONCURRENCY = 4;

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = getServiceClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 503 });
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ ok: true, processed: 0, note: "GEMINI_API_KEY not configured" });

  const ids = await pickCandidatesForCvFacts(admin, BATCH);
  const results = [];
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    results.push(...(await Promise.all(ids.slice(i, i + CONCURRENCY).map((id) => extractCvFactsForCandidate(id, admin)))));
  }
  // Sales CVs read before jobs carried an ownership level are read again, a few a day, so the rest of the bank catches up by itself.
  const stale = await pickCandidatesNeedingOwnership(admin, 20);
  for (let i = 0; i < stale.length; i += CONCURRENCY) {
    results.push(...(await Promise.all(stale.slice(i, i + CONCURRENCY).map((id) => extractCvFactsForCandidate(id, admin, { force: true })))));
  }
  return NextResponse.json({
    ok: true,
    processed: results.length,
    read: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  });
}

export const GET = withHeartbeat("cv-facts-sweep", 1440, handler);
