import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CandidatesSubNav from "../candidates-sub-nav";

export const dynamic = "force-dynamic";

// Activity: every time we contacted someone (WhatsApp, email, call) in one list, each with one plain outcome, so anyone can
// see who was contacted, how, by whom, and whether it worked. Read only.

type Row = { id: string; candidate_id: string | null; channel: "whatsapp" | "email" | "call"; kind: string; detail: string | null; sent_by: string | null; at: string; outcome: string };

const WHAT: [RegExp, string][] = [
  [/^profile_details/, "Asked for missing details"],
  [/^role_opportunity|^opportunity_intro/, "Told about a role"],
  [/^still_open|reactivation/, "Asked if open to roles"],
  [/^interview/, "Interview scheduling"],
  [/^offer/, "Offer follow-up"],
  [/^conversation_followup/, "Follow-up to reopen the chat"],
  [/^referral/, "Asked for a referral"],
  [/^placeability/, "Asked for missing details"],
  [/^welcome/, "Welcome email (automatic)"],
];
const whatOf = (r: Row) => {
  if (r.channel === "call") return "Phone call";
  if (r.kind === "message") return "Message";
  return WHAT.find(([re]) => re.test(r.kind))?.[1] ?? r.kind.replace(/_/g, " ");
};

const OUTCOME: Record<string, { label: string; group: "worked" | "waiting" | "problem" | "ended" }> = {
  replied: { label: "Replied", group: "worked" },
  said_yes: { label: "Said yes, open to roles", group: "worked" },
  updated_profile: { label: "Updated their profile", group: "worked" },
  spoke: { label: "Spoke to them", group: "worked" },
  read: { label: "Read, no reply yet", group: "waiting" },
  delivered: { label: "Delivered, not read", group: "waiting" },
  sent: { label: "Sent, no response yet", group: "waiting" },
  call_back: { label: "Call back due", group: "waiting" },
  no_answer: { label: "No answer", group: "waiting" },
  not_interested: { label: "Not interested", group: "ended" },
  not_delivered: { label: "Not delivered", group: "problem" },
  not_sent: { label: "Failed to send", group: "problem" },
  bounced: { label: "Email bounced", group: "problem" },
  delivery_problem: { label: "Delivery problem", group: "problem" },
  wrong_number: { label: "Wrong number", group: "problem" },
};
const GROUP_CLS = {
  worked: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  waiting: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  problem: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200",
  ended: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
};
const ICON = { whatsapp: MessageCircle, email: Mail, call: Phone };
const CHANNEL_LABEL = { whatsapp: "WhatsApp", email: "Email", call: "Call" };

const since = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ channel?: string; result?: string; days?: string; auto?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const days = sp.days === "7" ? 7 : sp.days === "90" ? 90 : 30;
  const channel = sp.channel === "whatsapp" || sp.channel === "email" || sp.channel === "call" ? sp.channel : null;
  const result = sp.result === "worked" || sp.result === "waiting" || sp.result === "problem" ? sp.result : null;
  const hideAuto = sp.auto !== "show";

  const { data, error } = await supabase.from("contact_activity").select("id, candidate_id, channel, kind, detail, sent_by, at, outcome").gte("at", since(days)).order("at", { ascending: false }).limit(3000);
  const all = (data ?? []) as Row[];
  // Automatic welcome emails are most of the volume; hidden by default so what people sent stays readable.
  const base = hideAuto ? all.filter((r) => r.kind !== "welcome") : all;
  const shown = base.filter((r) => (!channel || r.channel === channel) && (!result || OUTCOME[r.outcome]?.group === result)).slice(0, 300);

  const stats = (["whatsapp", "email", "call"] as const).map((ch) => {
    const rows = all.filter((r) => r.channel === ch && (ch !== "email" || !hideAuto || r.kind !== "welcome"));
    const worked = rows.filter((r) => OUTCOME[r.outcome]?.group === "worked").length;
    const problem = rows.filter((r) => OUTCOME[r.outcome]?.group === "problem").length;
    return { ch, total: rows.length, worked, problem, rate: rows.length ? Math.round((worked / rows.length) * 100) : 0 };
  });

  const candIds = Array.from(new Set(shown.map((r) => r.candidate_id).filter((v): v is string => !!v)));
  const senderIds = Array.from(new Set(shown.map((r) => r.sent_by).filter((v): v is string => !!v)));
  const [{ data: cands }, { data: senders }] = await Promise.all([
    candIds.length ? supabase.from("candidates").select("id, full_name, current_job_title, current_employer").in("id", candIds) : Promise.resolve({ data: [] }),
    senderIds.length ? supabase.from("profiles").select("id, full_name, email").in("id", senderIds) : Promise.resolve({ data: [] }),
  ]);
  const candOf = new Map(((cands ?? []) as { id: string; full_name: string | null; current_job_title: string | null; current_employer: string | null }[]).map((c) => [c.id, c]));
  const senderOf = new Map(((senders ?? []) as { id: string; full_name: string | null; email: string }[]).map((s) => [s.id, s.full_name?.trim().split(" ")[0] || s.email]));

  const qs = (over: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | null> = { channel, result, days: days === 30 ? null : String(days), auto: hideAuto ? null : "show", ...over };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "?";
  };
  const pill = (on: boolean) => `rounded-full border px-3 py-1 text-[12.5px] font-medium ${on ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`;

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-8">
      <CandidatesSubNav />
      <h1 className="ros-page-title">Activity</h1>
      <p className="mt-1 max-w-3xl text-[13px] text-slate-500 dark:text-slate-400">
        Everyone we contacted, how, by whom, and whether it worked. WhatsApp and email outcomes update by themselves: read, replied, updated their profile, said yes, or bounced.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {stats.map((s) => {
          const Icon = ICON[s.ch];
          return (
            <Link key={s.ch} href={qs({ channel: channel === s.ch ? null : s.ch })} className={`rounded-xl border bg-white p-4 transition hover:shadow-sm dark:bg-slate-900 ${channel === s.ch ? "border-teal-500 ring-1 ring-teal-500" : "border-slate-200 dark:border-slate-700"}`}>
              <p className="flex items-center gap-2 text-[12.5px] font-medium text-slate-500"><Icon className="h-4 w-4 text-teal-600" /> {CHANNEL_LABEL[s.ch]}, last {days} days</p>
              <p className="mt-1.5 text-[26px] font-semibold leading-none tabular-nums text-slate-900 dark:text-slate-100">{s.total}</p>
              <p className="mt-1.5 text-[12.5px] text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">{s.worked} worked ({s.rate}%)</span>
                {s.problem > 0 && <span className="text-rose-600"> · {s.problem} problems</span>}
              </p>
            </Link>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-1.5">
        <Link href={qs({ result: null })} className={pill(!result)}>All results</Link>
        <Link href={qs({ result: "worked" })} className={pill(result === "worked")}>Worked</Link>
        <Link href={qs({ result: "waiting" })} className={pill(result === "waiting")}>No response yet</Link>
        <Link href={qs({ result: "problem" })} className={pill(result === "problem")}>Problems</Link>
        <span className="mx-1 text-slate-300">|</span>
        {[7, 30, 90].map((d) => (
          <Link key={d} href={qs({ days: d === 30 ? null : String(d) })} className={pill(days === d)}>{d} days</Link>
        ))}
        <span className="mx-1 text-slate-300">|</span>
        <Link href={qs({ auto: hideAuto ? "show" : null })} className={pill(!hideAuto)}>{hideAuto ? "Show automatic welcome emails" : "Hide automatic welcome emails"}</Link>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">Couldn&apos;t load the activity: {error.message}</p>
      ) : shown.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-[14px] text-slate-500 dark:border-slate-700 dark:bg-slate-900">Nothing here for these filters.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2.5">When</th>
                <th className="px-4 py-2.5">Person</th>
                <th className="px-4 py-2.5">How</th>
                <th className="px-4 py-2.5">What</th>
                <th className="px-4 py-2.5">By</th>
                <th className="px-4 py-2.5">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {shown.map((r) => {
                const c = r.candidate_id ? candOf.get(r.candidate_id) : undefined;
                const o = OUTCOME[r.outcome] ?? { label: r.outcome, group: "waiting" as const };
                const Icon = ICON[r.channel];
                return (
                  <tr key={r.id} className="align-top hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-500" suppressHydrationWarning>{when(r.at)}</td>
                    <td className="px-4 py-2.5">
                      {c ? (
                        <Link href={`/candidates/${c.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-slate-900 hover:text-teal-700 dark:text-slate-100">{c.full_name ?? "Unnamed"}</Link>
                      ) : (
                        <span className="text-slate-500">Not linked to a profile</span>
                      )}
                      {c && <span className="block max-w-[260px] truncate text-xs text-slate-400">{[c.current_job_title, c.current_employer].filter(Boolean).join(" at ")}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-600 dark:text-slate-300"><span className="inline-flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" /> {CHANNEL_LABEL[r.channel]}</span></td>
                    <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">
                      {whatOf(r)}
                      {r.channel !== "email" && r.detail && <span className="block max-w-[360px] truncate text-xs text-slate-400">{r.detail}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{r.sent_by ? senderOf.get(r.sent_by) ?? "Team" : "Automatic"}</td>
                    <td className="px-4 py-2.5"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-medium ${GROUP_CLS[o.group]}`}>{o.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {base.length > 300 && <p className="mt-2 text-[12px] text-slate-400">Showing the latest 300. Narrow the filters to see more.</p>}
    </div>
  );
}
