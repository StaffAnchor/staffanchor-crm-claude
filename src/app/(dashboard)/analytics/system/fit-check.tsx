import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Row = {
  stage: string | null;
  in_shortlist: boolean | null;
  client_feedback: string | null;
  client_pass_reason: string | null;
  match_score: number | null;
  match_assessment: { recommendation?: string | null } | null;
  mandates: { client_name: string | null } | { client_name: string | null }[] | null;
};

const LABELS = ["Strong Fit", "Fit with Reservations", "Needs a call", "Not a Fit", "Not read yet"] as const;
const PASS_WORDS: Record<string, string> = { too_senior: "Too senior", too_junior: "Too junior", wrong_industry: "Wrong industry", pay_too_high: "Pay too high", wrong_city: "Wrong city", not_enough_experience: "Not enough experience", other: "Other" };

const WON = new Set(["client_interview", "client_shortlisted", "offer", "placed"]);
const clientOf = (r: Row) => (Array.isArray(r.mandates) ? r.mandates[0]?.client_name : r.mandates?.client_name) ?? "Unknown client";
const labelOf = (r: Row): (typeof LABELS)[number] => {
  const rec = r.match_assessment?.recommendation;
  if (rec === "Strong Fit" || rec === "Fit with Reservations" || rec === "Needs a call" || rec === "Not a Fit") return rec;
  return "Not read yet";
};
const liked = (r: Row) => r.client_feedback === "interested" || WON.has(r.stage ?? "");
const passed = (r: Row) => r.client_feedback === "not_interested" || r.stage === "pulled_back";
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export default async function FitCheckSection() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("candidate_mandate_links")
    .select("stage, in_shortlist, client_feedback, client_pass_reason, match_score, match_assessment, mandates(client_name)")
    .or("in_shortlist.eq.true,client_feedback.not.is.null")
    .limit(5000);
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.in_shortlist || r.client_feedback);

  const byLabel = LABELS.map((l) => {
    const rs = rows.filter((r) => labelOf(r) === l);
    return { l, shared: rs.length, liked: rs.filter(liked).length, passed: rs.filter(passed).length, placed: rs.filter((r) => r.stage === "placed").length };
  }).filter((x) => x.shared > 0);

  const clients = new Map<string, Row[]>();
  for (const r of rows) clients.set(clientOf(r), [...(clients.get(clientOf(r)) ?? []), r]);
  const byClient = Array.from(clients.entries())
    .map(([name, rs]) => {
      const likedRows = rs.filter(liked);
      const passRows = rs.filter(passed);
      const reasons = new Map<string, number>();
      for (const r of passRows) if (r.client_pass_reason) reasons.set(r.client_pass_reason, (reasons.get(r.client_pass_reason) ?? 0) + 1);
      const top = Array.from(reasons.entries()).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, n]) => `${PASS_WORDS[k] ?? k.replace(/_/g, " ")} (${n})`);
      return { name, shared: rs.length, liked: likedRows.length, passed: passRows.length, placed: rs.filter((r) => r.stage === "placed").length, likedAvg: avg(likedRows.map((r) => Number(r.match_score)).filter(Number.isFinite)), passAvg: avg(passRows.map((r) => Number(r.match_score)).filter(Number.isFinite)), top };
    })
    .sort((a, b) => b.shared - a.shared);

  const th = "px-3 py-2 text-left text-[12px] font-medium uppercase tracking-wide text-slate-500";
  const td = "px-3 py-2 text-[14px] text-slate-700 dark:text-slate-200";
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-[18px] font-semibold">Did our early read predict what clients did?</h2>
        <p className="mt-1 max-w-2xl text-[14px] text-slate-500">Every person shared with a client, grouped by what our fit read said at the time. If the read works, Strong Fit should be liked more often than Not a Fit. Small numbers move a lot, so look for a pattern over months, not single cases.</p>
        <div className="mt-3 overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
          <table className="min-w-full">
            <thead><tr><th className={th}>Early read</th><th className={th}>Shared</th><th className={th}>Client liked</th><th className={th}>Client passed</th><th className={th}>Placed</th><th className={th}>Liked share</th></tr></thead>
            <tbody>
              {byLabel.map((x) => (
                <tr key={x.l} className="border-t border-slate-100 dark:border-slate-800">
                  <td className={`${td} font-medium`}>{x.l}</td><td className={td}>{x.shared}</td><td className={td}>{x.liked}</td><td className={td}>{x.passed}</td><td className={td}>{x.placed}</td>
                  <td className={td}>{x.liked + x.passed > 0 ? `${Math.round((x.liked / (x.liked + x.passed)) * 100)}%` : "No answers yet"}</td>
                </tr>
              ))}
              {byLabel.length === 0 && <tr><td className={td} colSpan={6}>Nobody has been shared yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2 className="text-[18px] font-semibold">What each client actually likes</h2>
        <p className="mt-1 max-w-2xl text-[14px] text-slate-500">Per client: who they liked or placed, who they passed, the average match score of each, and why they pass. Use it before sharing: if a client passes on &quot;too senior&quot;, do not send them the senior ones.</p>
        <div className="mt-3 overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
          <table className="min-w-full">
            <thead><tr><th className={th}>Client</th><th className={th}>Shared</th><th className={th}>Liked</th><th className={th}>Passed</th><th className={th}>Placed</th><th className={th}>Avg score liked / passed</th><th className={th}>Why they pass</th></tr></thead>
            <tbody>
              {byClient.map((c) => (
                <tr key={c.name} className="border-t border-slate-100 dark:border-slate-800">
                  <td className={`${td} font-medium`}>{c.name}</td><td className={td}>{c.shared}</td><td className={td}>{c.liked}</td><td className={td}>{c.passed}</td><td className={td}>{c.placed}</td>
                  <td className={td}>{c.likedAvg ?? "–"} / {c.passAvg ?? "–"}</td><td className={td}>{c.top.join(", ") || "–"}</td>
                </tr>
              ))}
              {byClient.length === 0 && <tr><td className={td} colSpan={7}>No client answers yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
