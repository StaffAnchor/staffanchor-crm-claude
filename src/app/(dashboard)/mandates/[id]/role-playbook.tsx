import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

type Playbook = { in_pipeline: number; shortlisted: number; told: number; read: number; interested: number; not_now: number; no_reply: number; to_call: number; called: number };

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
      href: "#best-matches",
      done: typeSet && p.in_pipeline > 0,
    },
    {
      key: "reach",
      title: "2. Reach",
      big: p.told,
      label: p.told === 1 ? "person told about the role" : "people told about the role",
      line: p.told === 0 ? "Pick people in Matches and tell them about the role on WhatsApp. You see the message first." : `${p.read} read it${p.no_reply > 0 ? `, ${p.no_reply} no reply after 2 days` : ""}.`,
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
      line: "After a good call, share them from the pipeline.",
      cta: "Open the pipeline",
      href: "#pipeline",
      done: p.shortlisted > 0,
    },
  ];
  const next = steps.find((s) => !s.done)?.key ?? "send";

  return (
    <section aria-label="Role playbook" className="mt-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
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
            </div>
          );
        })}
      </div>
    </section>
  );
}
