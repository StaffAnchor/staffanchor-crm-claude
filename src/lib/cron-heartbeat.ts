import type { SupabaseClient } from "@supabase/supabase-js";

// Every scheduled job (see vercel.json's `crons` list) calls this once at
// the end of its run, success or failure. Without this, the only way to
// know a cron had silently stopped firing (wrong deploy active when Vercel
// registered the schedule, a thrown error before the response, a renamed
// route that no longer matches vercel.json) was a human running a manual
// SQL audit -- which is exactly how the embedding backfill went to 0/896
// candidates for weeks without anyone noticing. The pipeline-health-check
// cron (src/app/api/cron/pipeline-health-check/route.ts) reads this table
// and flags any job whose last_run_at is older than its own
// expectedIntervalMinutes * 2 as "broken."
export async function recordHeartbeat(
  supabase: SupabaseClient,
  jobName: string,
  status: "ok" | "error",
  expectedIntervalMinutes: number,
  detail?: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from("cron_heartbeats").upsert(
      {
        job_name: jobName,
        last_run_at: new Date().toISOString(),
        last_status: status,
        last_detail: detail ?? null,
        expected_interval_minutes: expectedIntervalMinutes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "job_name" }
    );
  } catch (err) {
    // Heartbeat recording must never break the cron it's instrumenting.
    console.error(`[cron-heartbeat] failed to record heartbeat for ${jobName}`, err);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Wraps a cron route's GET handler so it always records a heartbeat --
 * regardless of which internal branch the handler returns from, or whether
 * it throws. This is the mechanical way every /api/cron/* route gets
 * instrumented without having to hand-edit every early-return inside each
 * one. Usage: rename the existing `export async function GET` to a plain
 * `async function handler`, then add `export const GET = withHeartbeat("job-name", intervalMinutes, handler);`
 * at the bottom of the file.
 */
export function withHeartbeat(
  jobName: string,
  expectedIntervalMinutes: number,
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async function wrapped(req: NextRequest): Promise<NextResponse> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const admin = supabaseUrl && serviceKey ? createSupabaseClient(supabaseUrl, serviceKey) : null;

    try {
      const res = await handler(req);
      if (admin) {
        let detail: Record<string, unknown> | undefined;
        try {
          detail = await res.clone().json();
        } catch {
          // non-JSON response body -- fine, heartbeat just won't have detail.
        }
        await recordHeartbeat(admin, jobName, res.ok ? "ok" : "error", expectedIntervalMinutes, detail);
      }
      return res;
    } catch (err) {
      if (admin) {
        await recordHeartbeat(admin, jobName, "error", expectedIntervalMinutes, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      throw err;
    }
  };
}
