import Link from "next/link";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import RoleNudgeButton from "./role-nudge-button";

type Playbook = { summaries_approved: number; nudgeable: number; nudged: number; in_pipeline: number; shortlisted: number; told: number; read: number; interested: number; not_now: number; no_reply: number; to_call: number; called: number };

// The same four steps on every role, in the same order: Match, Reach, Track, Call, then Send to client. Each step shows
// where this role stands and one button for what to do next. The numbers come from the role's own outreach records, so
// nobody has to remember who was told about the role or what they answered.
export default async function RolePlaybook({ mandateId }: { mandateId: string }) {
  const supabase = await createClient();
  const [{ data }, { data: m }] = await Promise.all([
    supabase.rpc("role_playbook", { p_mandate: mandateId }),
    supabase.from("mandates").select("role_cluster").eq("id", mandateId).maybeSingle(),
  ]);
  const p = data as Playbook | null;
  if (!p) return null;
  // Matching needs the kind of role (and level) to be set once; until then there is nothing to rank against.
  const typeSet = !!m?.role_cluster;

  // The first step that still has work to do is the highlighted one.
  const steps = [
    {
      key: "match",
      title: "1. Match",
      big: p.in_pipeline,
      label: p.in_pipeline === 1 ? "person in the pipeline" : "people in the pipeline",
      line: typeSet ? "Review the best-fit people from the database, top tier first." : "First say what kind of role this is, so the system can find the right people.",
      cta: typeSet ? "Review matches" : "Set the role type",
      href: typeSet ? "#best-matches" : "/mandates/role-types",
      done: typeSet && p.in_pipeline > 0,
    },
    {
      key: "reach",
      title: "2. Reach",
      big: p.told,
      label: p.told === 1 ? "person told about the role" : "people told about the role",
      line: p.told === 0 ? "Pick people in Matches and tell them about the role on WhatsApp. You see the message first." : `${p.read} read it${p.no_reply > 0 ? `, ${p.no_reply} no reply after 2 days` : ""}${p.nudged > 0 ? `. ${p.nudged} reminded` : ""}.`,
      cta: p.told === 0 ? "Tell people about it" : "Tell more people",
      href: "#best-matches",
      done: p.told > 0,
    },
    {
      key: "track",
      title: "3. Track",
      big: p.interested,
      label: p.interested === 1 ? "said yes" : "said yes",
      line: p.told === 0 ? "Answers appear here by themselves." : `${p.not_now} said not now. A yes adds them to this role's pipeline.`,
      cta: p.interested > 0 ? "See the pipeline" : null,
      href: "#pipeline",
      done: p.interested > 0,
    },
    {
      key: "call",
      title: "4. Call",
      big: p.to_call,
      label: p.to_call === 1 ? "yes to call now" : "yeses to call now",
      line: p.interested === 0 ? "Those who say yes go to the top of Calls today." : `${p.called} already spoken to.`,
      cta: p.to_call > 0 ? "Open Calls today" : null,
      href: "/candidates/calls",
      done: p.interested > 0 && p.to_call === 0,
    },
    {
      key: "send",
      title: "5. Send to client",
      big: p.shortlisted,
      label: "in the client shortlist",
      line: p.shortlisted > 0 ? `${p.summaries_approved} of ${p.shortlisted} have an approved one-page summary for the client.` : "After a good call, share them from the pipeline.",
      cta: p.shortlisted > 0 && p.summaries_approved < p.shortlisted ? "Review client summaries" : p.shortlisted > 0 ? "Client summaries" : "Open the pipeline",
      href: p.shortlisted > 0 ? `/mandates/${mandateId}/summaries` : "#pipeline",
      done: p.shortlisted > 0,
    },
  ];
  const next = steps.find((s) => !s.done)?.key ?? "send";

  const nextStep = steps.find((x) => x.key === next)!;
  const SHORT: Record<string, string> = { match: "Match", reach: "Reach", track: "Track", call: "Call", send: "Send to client" };

  // One slim line that says where the role stands and offers the next step. The full guide, with each step's explanation,
  // opens underneath for anyone who wants it.
  return (
    <section aria-label="Role playbook" className="mt-3 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-1.5 gap-y-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
          {steps.map((s, i) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              {i > 0 && <span className="h-px w-3 bg-slate-200 dark:bg-slate-700" aria-hidden />}
              <span
                title={s.line}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] ${
                  s.key === next
                    ? "bg-teal-50 font-semibold text-teal-800 ring-1 ring-teal-300 dark:bg-teal-950/40 dark:text-teal-200 dark:ring-teal-800"
                    : s.done
                      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                {SHORT[s.key]} <span className="font-semibold tabular-nums">{s.big}</span>
                {s.done && <Check className="h-3 w-3" aria-label="done" />}
              </span>
            </span>
          ))}
          <span className="ml-auto flex items-center gap-2">
            {nextStep.cta &&
              (nextStep.href.startsWith("#") ? (
                <a href={nextStep.href} className="inline-flex items-center gap-1 rounded-full bg-teal-600 px-3 py-1 text-[12.5px] font-semibold text-white hover:bg-teal-700">
                  {nextStep.cta} <ArrowRight className="h-3 w-3" />
                </a>
              ) : (
                <Link href={nextStep.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-teal-600 px-3 py-1 text-[12.5px] font-semibold text-white hover:bg-teal-700">
                  {nextStep.cta} <ArrowRight className="h-3 w-3" />
                </Link>
              ))}
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
              Guide <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            </span>
          </span>
        </summary>
        <div className="grid grid-cols-1 gap-2 border-t border-slate-100 p-3 dark:border-slate-800 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((s) => {
            const isNext = s.key === next;
            const Cta = s.cta ? (
              s.href.startsWith("#") ? (
                <a href={s.href} className={`mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12.5px] font-semibold ${isNext ? "bg-teal-600 text-white hover:bg-teal-700" : "border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"}`}>
                  {s.cta} <ArrowRight className="h-3 w-3" />
                </a>
              ) : (
                <Link href={s.href} target="_blank" rel="noopener noreferrer" className={`mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12.5px] font-semibold ${isNext ? "bg-teal-600 text-white hover:bg-teal-700" : "border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"}`}>
                  {s.cta} <ArrowRight className="h-3 w-3" />
                </Link>
              )
            ) : null;
            return (
              <div key={s.key} className={`rounded-lg border px-3 py-2.5 ${isNext ? "border-teal-400 bg-teal-50/60 dark:border-teal-700 dark:bg-teal-950/20" : "border-slate-100 dark:border-slate-800"}`}>
                <p className="flex items-center justify-between text-[12px] font-semibold text-slate-600 dark:text-slate-300">
                  {s.title}
                  {s.done && <Check className="h-3.5 w-3.5 text-emerald-600" aria-label="done" />}
                </p>
                <p className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-[22px] font-semibold leading-none tabular-nums text-slate-900 dark:text-slate-100">{s.big}</span>
                  <span className="text-[12px] text-slate-500">{s.label}</span>
                </p>
                <p className="mt-1 text-[11.5px] leading-4 text-slate-500 dark:text-slate-400">{s.line}</p>
                {Cta}
                {s.key === "reach" && p.nudgeable > 0 && <RoleNudgeButton mandateId={mandateId} count={p.nudgeable} />}
              </div>
            );
          })}
        </div>
      </details>
    </section>
  );
}
