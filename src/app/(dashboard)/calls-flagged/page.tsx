import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CallsFlaggedTable, { type FlaggedCallRow } from "./calls-flagged-table";

// The full-page counterpart to the header bell / Team Calls panel: those
// are deliberately compact (a dropdown, an expandable card list), but a
// recruiter or admin actually working through a stack of flagged calls
// needs the same thing the mandate pipeline gives them -- a real table,
// one row per candidate, with enough on it to decide and act without
// opening each profile. Same underlying data (recruiter_inbox
// CANDIDATE_CALL_REQUEST rows, same "pending only" disposed-candidate
// filter) as the bell and panel, just presented as a table instead of a
// card list, and it's what "back" now returns to from a candidate's
// profile (see candidates/[id]/page.tsx's back=calls handling) instead of
// dumping them on the mandate page they may not have been working from.
//
// `?recruiter=<id>` is admin-only: lets an admin open a specific
// teammate's queue from the Team Calls panel (see team-calls-panel.tsx's
// "View full list" link) without seeing everyone's mixed together. Absent
// (or supplied by a non-admin, which is ignored), this is always "my
// flagged calls" -- the same scope the header bell shows.
export default async function CallsFlaggedPage({
  searchParams,
}: {
  searchParams: Promise<{ recruiter?: string }>;
}) {
  const { recruiter: recruiterParam } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: myProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isAdmin = myProfile?.role === "admin";
  const targetRecruiterId = isAdmin && recruiterParam ? recruiterParam : user.id;

  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", targetRecruiterId)
    .single();
  const isSelf = targetRecruiterId === user.id;
  const heading = isSelf ? "Calls flagged for me" : `Calls flagged for ${targetProfile?.full_name?.trim() || targetProfile?.email || "teammate"}`;

  const nowIso = new Date().toISOString();
  const { data: flaggedCallRows } = await supabase
    .from("recruiter_inbox")
    .select(
      "id, candidate_id, mandate_id, call_round, detail, created_at, candidates(id, full_name, category, sub_domain, current_fixed_ctc, notice_period, resume_file_url), mandates(id, role_title, client_name)"
    )
    .eq("task_type", "CANDIDATE_CALL_REQUEST")
    .eq("recruiter_id", targetRecruiterId)
    .or(`status.eq.open,and(status.eq.snoozed,snoozed_until.lte.${nowIso})`);

  // Same "pending only" rule as everywhere else this data shows up (see
  // get_my_inbox() / team/page.tsx) -- a call flagged before the candidate
  // was rejected or pulled back off this mandate is stale the moment that
  // happens, and this also doubles as where the disposition + link id each
  // row's CallDispositionControl needs come from.
  const mandateIds = Array.from(new Set((flaggedCallRows ?? []).map((r) => r.mandate_id).filter(Boolean)));
  const candidateIds = Array.from(new Set((flaggedCallRows ?? []).map((r) => r.candidate_id).filter(Boolean)));
  const { data: linkRows } = mandateIds.length
    ? await supabase
        .from("candidate_mandate_links")
        .select("id, candidate_id, mandate_id, stage, call_disposition")
        .in("mandate_id", mandateIds)
        .in("candidate_id", candidateIds)
    : { data: [] as { id: string; candidate_id: string; mandate_id: string; stage: string; call_disposition: string | null }[] };
  const linkByKey = new Map((linkRows ?? []).map((l) => [`${l.candidate_id}:${l.mandate_id}`, l]));

  const rows: FlaggedCallRow[] = (flaggedCallRows ?? [])
    .map((r) => {
      const link = linkByKey.get(`${r.candidate_id}:${r.mandate_id}`);
      const candidate = r.candidates as unknown as {
        id: string;
        full_name: string | null;
        category: string | null;
        sub_domain: string | null;
        current_fixed_ctc: number | null;
        notice_period: string | null;
        resume_file_url: string | null;
      } | null;
      const mandate = r.mandates as unknown as { id: string; role_title: string | null; client_name: string | null } | null;
      return {
        id: r.id,
        linkId: link?.id ?? null,
        candidate_id: candidate?.id ?? null,
        candidate_name: candidate?.full_name ?? null,
        candidate_category: candidate?.category ?? null,
        candidate_sub_domain: candidate?.sub_domain ?? null,
        candidate_current_fixed_ctc: candidate?.current_fixed_ctc ?? null,
        candidate_notice_period: candidate?.notice_period ?? null,
        candidate_resume_file_url: candidate?.resume_file_url ?? null,
        mandate_id: mandate?.id ?? null,
        mandate_role_title: mandate?.role_title ?? null,
        mandate_client_name: mandate?.client_name ?? null,
        call_round: r.call_round as string | null,
        detail: r.detail as string | null,
        created_at: r.created_at,
        stage: link?.stage ?? null,
        call_disposition: link?.call_disposition ?? null,
      };
    })
    .filter((r) => r.stage !== "rejected" && r.stage !== "pulled_back")
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Same batch-signed-URL pattern as the mandate Table/Board (see
  // mandates/[id]/page.tsx) -- one Storage call for every resume on this
  // page rather than one per row, so "Preview" works here without a
  // recruiter having to open each candidate's profile just to see the CV.
  const resumePaths = Array.from(
    new Set(rows.map((r) => r.candidate_resume_file_url).filter((p): p is string => Boolean(p)).map((p) => p.replace(/^resumes\//, "")))
  );
  const resumeUrlByPath: Record<string, string> = {};
  if (resumePaths.length > 0) {
    const { data: signedBatch } = await supabase.storage.from("resumes").createSignedUrls(resumePaths, 60 * 60);
    (signedBatch ?? []).forEach((s) => {
      if (s.signedUrl && !s.error && s.path) resumeUrlByPath[s.path] = s.signedUrl;
    });
  }
  const resumeSignedUrlByCandidate: Record<string, string> = {};
  for (const r of rows) {
    if (!r.candidate_id || !r.candidate_resume_file_url) continue;
    const signedUrl = resumeUrlByPath[r.candidate_resume_file_url.replace(/^resumes\//, "")];
    if (signedUrl) resumeSignedUrlByCandidate[r.candidate_id] = signedUrl;
  }

  return (
    <div className="max-w-[1400px] mx-auto px-5 py-8">
      <h1 className="text-ros-display font-semibold tracking-tight text-slate-900 dark:text-slate-100 mb-1">{heading}</h1>
      <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-4">
        Open call flags across every mandate -- record the outcome right here, same as the mandate pipeline.
      </p>
      <CallsFlaggedTable rows={rows} recruiterId={isSelf ? undefined : targetRecruiterId} resumeSignedUrlByCandidate={resumeSignedUrlByCandidate} />
    </div>
  );
}
