import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CallsFlaggedTable, { type FlaggedCallRow } from "./calls-flagged-table";

// Open vs All-time are the *same* route path with only the search params
// differing (?status=all). Next.js's client Router Cache doesn't reliably
// bust on a search-param-only change for a dynamic page with no
// loading.tsx boundary -- clicking the "All time" tab was sometimes
// re-using the already-rendered "Open" segment instead of re-fetching,
// so the table silently stayed on the open-only rows. Forcing this page
// fully dynamic/no-store (below) plus disabling prefetch on the tab links
// guarantees every tab click actually hits the server for fresh data.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

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
//
// `?status=all` is the analysis view -- "what did I assign this person,
// and what happened to each one" (an admin checking on a teammate's whole
// history, not just what's still outstanding). The default ("open") stays
// exactly the working-queue behavior above: only pending flags, disposed
// candidates dropped. "all" instead shows every flag ever raised for the
// target recruiter regardless of open/done, and stops hiding
// rejected/pulled_back candidates -- those rejections (often via
// call_disposition itself) are precisely the outcomes this view exists to
// show.
export default async function CallsFlaggedPage({
  searchParams,
}: {
  searchParams: Promise<{ recruiter?: string; status?: string }>;
}) {
  const { recruiter: recruiterParam, status: statusParam } = await searchParams;
  const showAll = statusParam === "all";
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
  let query = supabase
    .from("recruiter_inbox")
    .select(
      "id, candidate_id, mandate_id, call_round, detail, status, resolved_at, created_at, candidates(id, full_name, category, sub_domain, current_fixed_ctc, notice_period, resume_file_url), mandates(id, role_title, client_name)"
    )
    .eq("task_type", "CANDIDATE_CALL_REQUEST")
    .eq("recruiter_id", targetRecruiterId);
  if (!showAll) {
    query = query.or(`status.eq.open,and(status.eq.snoozed,snoozed_until.lte.${nowIso})`);
  }
  const { data: flaggedCallRows } = await query;

  // Same "pending only" rule as everywhere else this data shows up (see
  // get_my_inbox() / team/page.tsx) -- a call flagged before the candidate
  // was rejected or pulled back off this mandate is stale the moment that
  // happens, and this also doubles as where the disposition + link id each
  // row's CallDispositionControl needs come from. Skipped entirely in the
  // "all" analysis view, since a rejected/pulled-back stage is often
  // exactly the outcome being reviewed.
  const mandateIds = Array.from(new Set((flaggedCallRows ?? []).map((r) => r.mandate_id).filter(Boolean)));
  const candidateIds = Array.from(new Set((flaggedCallRows ?? []).map((r) => r.candidate_id).filter(Boolean)));
  const { data: linkRows } = mandateIds.length
    ? await supabase
        .from("candidate_mandate_links")
        .select("id, candidate_id, mandate_id, stage, call_disposition, second_round_outcome")
        .in("mandate_id", mandateIds)
        .in("candidate_id", candidateIds)
    : {
        data: [] as {
          id: string;
          candidate_id: string;
          mandate_id: string;
          stage: string;
          call_disposition: string | null;
          second_round_outcome: string | null;
        }[],
      };
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
        flag_status: r.status as string,
        resolved_at: r.resolved_at as string | null,
        stage: link?.stage ?? null,
        call_disposition: link?.call_disposition ?? null,
        second_round_outcome: link?.second_round_outcome ?? null,
      };
    })
    .filter((r) => showAll || (r.stage !== "rejected" && r.stage !== "pulled_back"))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

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

  const { data: teamMembers } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .order("full_name");

  const { count: allTimeCount } = await supabase
    .from("recruiter_inbox")
    .select("id", { count: "exact", head: true })
    .eq("task_type", "CANDIDATE_CALL_REQUEST")
    .eq("recruiter_id", targetRecruiterId);

  const tabHref = (status: "open" | "all") => {
    const params = new URLSearchParams();
    if (recruiterParam) params.set("recruiter", recruiterParam);
    if (status === "all") params.set("status", "all");
    const qs = params.toString();
    return qs ? `/calls-flagged?${qs}` : "/calls-flagged";
  };

  return (
    <div className="max-w-[1400px] mx-auto px-5 py-8">
      <h1 className="text-ros-display font-semibold tracking-tight text-slate-900 dark:text-slate-100 mb-1">{heading}</h1>
      <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-4">
        {showAll
          ? "Every call ever flagged here -- open and closed, with the outcome recorded on each -- for reviewing how they were handled."
          : "Open call flags across every mandate -- record the outcome right here, same as the mandate pipeline."}
      </p>
      <div className="flex items-center gap-1 mb-4">
        {/* Plain <a> tags, deliberately not next/link's <Link>: Open and
            All-time are the same route differing only by search params,
            and a client-side soft navigation between them was observed
            (live) to reuse the previously-rendered segment's rows instead
            of refetching -- even with this page forced fully dynamic/
            no-store and prefetch disabled. A full page load per tab click
            is a non-issue for an occasional admin lookup like this, and
            it guarantees the row set actually matches the tab shown. */}
        <a
          href={tabHref("open")}
          className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium ${
            !showAll
              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          }`}
        >
          Open
        </a>
        <a
          href={tabHref("all")}
          className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium ${
            showAll
              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          }`}
        >
          All time ({allTimeCount ?? 0})
        </a>
      </div>
      <CallsFlaggedTable
        rows={rows}
        recruiterId={isSelf ? undefined : targetRecruiterId}
        resumeSignedUrlByCandidate={resumeSignedUrlByCandidate}
        showAll={showAll}
        teamMembers={teamMembers ?? []}
        defaultRecruiterId={targetRecruiterId}
      />
    </div>
  );
}
