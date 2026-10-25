import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Brief } from "@/lib/candidate-brief";
import Summaries, { type SummaryRow } from "./summaries";

export const dynamic = "force-dynamic";

// Client summaries for one role: the shortlist, each person's one-pager, and an Approve button. A client sees a one-pager
// in the portal only after it is approved here (or on the person's profile).
export default async function RoleSummariesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: mandate } = await supabase.from("mandates").select("id, role_title, client_name").eq("id", id).maybeSingle();
  if (!mandate) notFound();

  const { data: links } = await supabase.from("candidate_mandate_links").select("candidate_id, candidates(id, full_name, current_job_title, current_employer)").eq("mandate_id", id).eq("in_shortlist", true);
  const rows = (links ?? []) as unknown as { candidate_id: string; candidates: { id: string; full_name: string | null; current_job_title: string | null; current_employer: string | null } | null }[];
  const ids = rows.map((r) => r.candidate_id);
  const { data: briefs } = ids.length ? await supabase.from("candidate_briefs").select("candidate_id, brief, approved_brief, approved_at").in("candidate_id", ids) : { data: [] };
  const byId = new Map(((briefs ?? []) as { candidate_id: string; brief: Brief; approved_brief: Brief | null; approved_at: string | null }[]).map((b) => [b.candidate_id, b]));

  const list: SummaryRow[] = rows
    .filter((r) => r.candidates)
    .map((r) => {
      const b = byId.get(r.candidate_id);
      return {
        id: r.candidate_id,
        name: r.candidates!.full_name ?? "Unnamed",
        line: [r.candidates!.current_job_title, r.candidates!.current_employer].filter(Boolean).join(" at "),
        brief: b?.brief ?? null,
        approvedAt: b?.approved_at ?? null,
        changed: !!b?.approved_brief && JSON.stringify(b.approved_brief) !== JSON.stringify(b.brief),
      };
    });

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-8">
      <Link href={`/mandates/${id}`} className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400">← {mandate.role_title ?? "Role"}</Link>
      <h1 className="ros-page-title mt-2">Client summaries</h1>
      <p className="mt-1 max-w-3xl text-[13px] text-slate-500 dark:text-slate-400">
        {mandate.client_name ? `${mandate.client_name} ` : "The client "}sees a one-page summary for each person you share, once you approve it. The system writes the draft from the CV and your call notes; read it, and approve only what you are happy for the client to read.
      </p>
      {list.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-[14px] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          Nobody is on this role&apos;s client shortlist yet. Share people from the pipeline first.
        </p>
      ) : (
        <Summaries mandateId={id} rows={list} />
      )}
    </div>
  );
}
