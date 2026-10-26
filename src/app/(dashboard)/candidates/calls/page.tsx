import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import CandidatesSubNav from "../candidates-sub-nav";
import CallsDesk, { type CallPerson } from "./calls-desk";

export const dynamic = "force-dynamic";

const DAILY_TARGET = 50;

// Midnight today in India, as an ISO time, so "today" means the recruiter's day.
function istDayStartIso(): string {
  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 5.5 * 3_600_000).toISOString();
}

// Calls today: one list for whoever is on the phones. The system picks who to call (strongest first), shows the CV next to
// the call, and everything said on the call is typed straight into the profile. Nothing is sent to anyone from here.
const FOCUS = [
  { key: "noctc", label: "No CTC", hint: "Sales profiles with no current pay: 3+ years first, newest sign-ups first. Source and sign-up date are on each card" },
  { key: "mixed", label: "Mixed", hint: "Half qualify, half fill gaps" },
  { key: "qualify", label: "Qualify", hint: "Pay known, ratio 1.5+: rate them and confirm they are looking" },
  { key: "complete", label: "Fill gaps", hint: "Missing current pay first, then notice period and expected pay" },
] as const;

export default async function CallsTodayPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  const sp = await searchParams;
  const focus = FOCUS.some((f) => f.key === sp.focus) ? (sp.focus as (typeof FOCUS)[number]["key"]) : "noctc";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner", "freelancer"].includes(me.role)) redirect("/today");

  const [{ data: rows, error }, { data: todays }] = await Promise.all([
    supabase.rpc("calls_today", { p_limit: DAILY_TARGET, p_focus: focus }),
    supabase.from("call_log").select("caller_id, outcome").gte("created_at", istDayStartIso()).limit(2000),
  ]);
  const people = ((rows ?? []) as CallPerson[]).map((p) => ({ ...p, resume_url: null as string | null }));

  // CVs open inline next to the call, so every CV in today's list gets a short-lived link.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (key && people.length) {
    const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
    const paths = people.map((p) => (p.resume_file_url ?? "").replace(/^resumes\//, "")).filter(Boolean);
    if (paths.length) {
      const { data: signed } = await admin.storage.from("resumes").createSignedUrls(paths, 4 * 3600);
      const byPath = new Map((signed ?? []).filter((s) => s.signedUrl).map((s) => [s.path as string, s.signedUrl as string]));
      for (const p of people) p.resume_url = byPath.get((p.resume_file_url ?? "").replace(/^resumes\//, "")) ?? null;
    }
  }

  const log = (todays ?? []) as { caller_id: string | null; outcome: string }[];
  const byCaller = new Map<string, number>();
  for (const l of log) if (l.caller_id) byCaller.set(l.caller_id, (byCaller.get(l.caller_id) ?? 0) + 1);
  const ids = Array.from(byCaller.keys());
  const { data: names } = ids.length ? await supabase.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] };
  const team = ((names ?? []) as { id: string; full_name: string | null; email: string }[])
    .map((n) => ({ name: n.full_name?.trim() || n.email, calls: byCaller.get(n.id) ?? 0, me: n.id === user.id }))
    .sort((a, b) => b.calls - a.calls);
  const reached = log.filter((l) => l.outcome === "reached").length;

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-8">
      <CandidatesSubNav />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="ros-page-title">Calls today</h1>
          <p className="mt-1 max-w-3xl text-[13px] text-slate-500 dark:text-slate-400">
            The people worth calling, strongest first. Call, fill in what they tell you, rate how they came across, then pick the result. The next person opens by itself.
          </p>
        </div>
        <div className="text-right text-[12.5px] text-slate-500 dark:text-slate-400">
          <p>
            <span className="text-[22px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">{byCaller.get(user.id) ?? 0}</span> / {DAILY_TARGET} calls by you today
          </p>
          <p>
            Team today: {log.length} calls, {reached} reached
            {team.length > 0 && ` · ${team.map((t) => `${t.me ? "you" : t.name.split(" ")[0]} ${t.calls}`).join(", ")}`}
          </p>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="font-medium text-slate-500">Today&apos;s focus:</span>
        {FOCUS.map((f) => (
          <a
            key={f.key}
            href={f.key === "mixed" ? "?" : `?focus=${f.key}`}
            title={f.hint}
            className={`rounded-full border px-3 py-1 font-medium ${focus === f.key ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}
          >
            {f.label}
          </a>
        ))}
        <span className="text-slate-400">{FOCUS.find((f) => f.key === focus)?.hint}</span>
      </div>
      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">Couldn&apos;t load today&apos;s list: {error.message}</p>
      ) : (
        <CallsDesk people={people} />
      )}
    </div>
  );
}
