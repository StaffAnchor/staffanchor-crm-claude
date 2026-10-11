import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import CandidatesSubNav from "../candidates-sub-nav";
import { buildOutreachEmail, dailyCap } from "@/lib/outreach";
import OutreachView from "./outreach-view";

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
  const sample = buildOutreachEmail({ id: "00000000-0000-0000-0000-000000000000", full_name: "Priya Sharma", email: "priya@example.com" }, ["current_ctc", "expected_ctc", "notice"]);
  const cap = dailyCap((stats?.first_sent_at as string | null) ?? null, new Date().getTime());

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-8">
      <CandidatesSubNav />
      <OutreachView
        sender={process.env.GMAIL_USER ?? null}
        configured={!!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD && key)}
        stats={{
          eligible: Number(stats?.eligible ?? 0),
          sent24h: Number(stats?.sent_24h ?? 0),
          sentTotal: Number(stats?.sent_total ?? 0),
          failedTotal: Number(stats?.failed_total ?? 0),
          optedOut: Number(stats?.opted_out ?? 0),
        }}
        cap={cap}
        next={next}
        preview={{ subject: sample.subject, text: sample.text.replace(/\?c=[0-9a-f-]+&t=[0-9a-f]+/, "?c=…&t=…") }}
      />
    </div>
  );
}
