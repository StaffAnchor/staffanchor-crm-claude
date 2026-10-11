import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import CandidatesSubNav from "../candidates-sub-nav";
import { buildOutreachEmail, dailyCap } from "@/lib/outreach";
import OutreachView from "./outreach-view";
import RepliesPanel, { type ReplyRow } from "./replies-panel";

export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) redirect("/candidates");

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin = key ? createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key) : null;
  const stats = admin ? ((await admin.rpc("outreach_stats")).data as Record<string, number | string | null> | null) : null;
  const { data: nextRows } = admin ? await admin.rpc("outreach_next", { p_limit: 5 }) : { data: [] };
  const next = ((nextRows ?? []) as { id: string; full_name: string | null; email: string; asks: string[] }[]).map((r) => ({
    id: r.id,
    name: r.full_name ?? "—",
    asks: r.asks,
    emailHint: r.email.replace(/^(.).*(@.*)$/, "$1•••$2"),
  }));
  // Replies read from the mailbox in the last 30 days.
  const since30 = new Date(new Date().getTime() - 30 * 86_400_000).toISOString();
  const { data: replyData } = await supabase
    .from("email_replies")
    .select("message_id, status, received_at, from_email, candidate_id, applied, snippet")
    .gte("created_at", since30)
    .order("received_at", { ascending: false })
    .limit(200);
  const replyAll = (replyData ?? []) as Omit<ReplyRow, "name">[];
  const replyCounts: Record<string, number> = {};
  for (const r of replyAll) replyCounts[r.status] = (replyCounts[r.status] ?? 0) + 1;
  const shown = replyAll.filter((r) => r.status !== "not_a_reply").slice(0, 8);
  const replyIds = Array.from(new Set(shown.map((r) => r.candidate_id).filter((v): v is string => !!v)));
  const { data: replyNames } = replyIds.length ? await supabase.from("candidates").select("id, full_name").in("id", replyIds) : { data: [] };
  const nameOf = new Map(((replyNames ?? []) as { id: string; full_name: string | null }[]).map((c) => [c.id, c.full_name]));
  const replyRows: ReplyRow[] = shown.map((r) => ({ ...r, name: r.candidate_id ? nameOf.get(r.candidate_id) ?? null : null }));

  const sample = buildOutreachEmail({ id: "00000000-0000-0000-0000-000000000000", full_name: "Priya Sharma", email: "priya@example.com" }, ["current_ctc", "expected_ctc", "notice"]);
  const cap = dailyCap((stats?.first_sent_at as string | null) ?? null, new Date().getTime());

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-8">
      <CandidatesSubNav />
      <RepliesPanel mailbox={process.env.GMAIL_USER ?? null} counts={replyCounts} rows={replyRows} />
      <OutreachView
        sender={process.env.GMAIL_USER ?? null}
        configured={!!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD && key)}
        stats={{
          eligible: Number(stats?.eligible ?? 0),
          sent24h: Number(stats?.sent_24h ?? 0),
          sentTotal: Number(stats?.sent_total ?? 0),
          failedTotal: Number(stats?.failed_total ?? 0),
          optedOut: Number(stats?.opted_out ?? 0),
          welcomeQueued: Number(stats?.welcome_queued ?? 0),
        }}
        cap={cap}
        next={next}
        preview={{ subject: sample.subject, html: sample.html }}
      />
    </div>
  );
}
