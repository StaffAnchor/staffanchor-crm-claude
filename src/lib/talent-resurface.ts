import type { SupabaseClient } from "@supabase/supabase-js";
import { matchCandidatesForMandate } from "@/lib/candidate-match";

// Talent resurfacing: the one gap the event-driven proactive matcher
// (proactive-match.ts / proactive-match-sweep steps 1-2) can never close --
// it only ever re-checks a mandate against candidates whose embedding
// *just* changed, so a mandate opened before a strong candidate existed (or
// a candidate who hasn't touched their profile since) never gets compared.
// This runs a genuine full-candidate-pool matchCandidatesForMandate() (no
// candidateIdsOverride) for a small number of open mandates -- prioritizing
// ones that have never been scanned, then the stalest -- so every open
// mandate eventually gets a real look at the whole database, not just
// whoever happened to recently edit their profile. Shared between the
// weekly cron (api/cron/proactive-match-sweep) and the admin "Run now"
// button (api/admin/resurface-backfill) so both paths behave identically.

export const RESURFACE_STALE_DAYS = 30; // re-scan a mandate's full pool at most this often
export const RESURFACE_INBOX_SCORE_THRESHOLD = 70; // only ping the inbox for genuinely strong "silver medalist" hits

export type ResurfaceMandateResult = { mandate_id: string; ok: boolean; matched?: number; strongHits?: number; error?: string };

export async function pickMandatesToResurface(admin: SupabaseClient, limit: number): Promise<string[]> {
  const staleCutoff = new Date(Date.now() - RESURFACE_STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: neverScanned } = await admin
    .from("mandates")
    .select("id")
    .eq("status", "open")
    .eq("is_archived", false)
    .is("last_resurface_scan_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  const ids = (neverScanned ?? []).map((m) => m.id as string);
  if (ids.length >= limit) return ids;

  const { data: stale } = await admin
    .from("mandates")
    .select("id")
    .eq("status", "open")
    .eq("is_archived", false)
    .not("last_resurface_scan_at", "is", null)
    .lt("last_resurface_scan_at", staleCutoff)
    .order("last_resurface_scan_at", { ascending: true })
    .limit(limit - ids.length);

  return ids.concat((stale ?? []).map((m) => m.id as string));
}

export async function resurfaceMandate(admin: SupabaseClient, mandateId: string): Promise<ResurfaceMandateResult> {
  let result: ResurfaceMandateResult;
  let strongHits = 0;
  try {
    const match = await matchCandidatesForMandate(mandateId, admin);
    if (match.ok) {
      for (const m of match.matches) {
        await admin
          .from("mandate_proactive_matches")
          .upsert(
            { mandate_id: mandateId, candidate_id: m.candidate_id, match: m, trigger_reason: "full_pool_resurface" },
            { onConflict: "mandate_id,candidate_id" }
          );
        if ((m.score ?? 0) >= RESURFACE_INBOX_SCORE_THRESHOLD) strongHits++;
      }
      result = { mandate_id: mandateId, ok: true, matched: match.matches.length, strongHits };
    } else {
      result = { mandate_id: mandateId, ok: false, error: match.error };
    }
  } catch (err) {
    result = { mandate_id: mandateId, ok: false, error: err instanceof Error ? err.message : "resurface scan failed" };
  }

  await admin.from("mandates").update({ last_resurface_scan_at: new Date().toISOString() }).eq("id", mandateId);

  if (strongHits > 0) {
    await createResurfacedMatchesInboxRow(admin, mandateId, strongHits);
  }

  return result;
}

// Mirrors sweep_recruiter_inbox()'s conventions (mandate-level task,
// recruiter resolved via mandate_assignments with an unassigned/null
// fallback, dedup against an existing open/snoozed row of the same type for
// this mandate) so RESURFACED_MATCHES behaves exactly like the SQL-driven
// inbox rows the recruiter already knows -- one card per mandate, refreshed
// rather than duplicated on every run.
async function createResurfacedMatchesInboxRow(admin: SupabaseClient, mandateId: string, strongHits: number) {
  const { data: mandate } = await admin.from("mandates").select("role_title, client_name").eq("id", mandateId).single();
  if (!mandate) return;

  const { data: assignments } = await admin.from("mandate_assignments").select("freelancer_id").eq("mandate_id", mandateId);
  const recipients: (string | null)[] =
    assignments && assignments.length > 0 ? assignments.map((a) => a.freelancer_id as string) : [null];

  const title = `${strongHits} new candidate${strongHits === 1 ? "" : "s"} match: ${mandate.role_title} (${mandate.client_name ?? ""})`;
  const detail = `Full-pool resurfacing scan found ${strongHits} strong candidate${strongHits === 1 ? "" : "s"} already in the database who weren't in this mandate's pipeline.`;

  for (const recruiterId of recipients) {
    let existing = admin
      .from("recruiter_inbox")
      .select("id")
      .eq("mandate_id", mandateId)
      .eq("task_type", "RESURFACED_MATCHES")
      .in("status", ["open", "snoozed"]);
    existing = recruiterId ? existing.eq("recruiter_id", recruiterId) : existing.is("recruiter_id", null);
    const { data: existingRows } = await existing.limit(1);

    if (existingRows && existingRows.length > 0) {
      await admin.from("recruiter_inbox").update({ title, detail }).eq("id", existingRows[0].id);
      continue;
    }

    await admin.from("recruiter_inbox").insert({
      recruiter_id: recruiterId,
      mandate_id: mandateId,
      task_type: "RESURFACED_MATCHES",
      title,
      detail,
      priority: "normal",
    });
  }
}
