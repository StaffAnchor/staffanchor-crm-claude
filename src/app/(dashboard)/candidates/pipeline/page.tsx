import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Bot, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CandidatesSubNav from "../candidates-sub-nav";
import BatchPanel from "./batch-panel";
import { profileChecklist } from "@/lib/profile-checklist";
import { profileLabel } from "@/lib/sub-group";

export const dynamic = "force-dynamic";

type Counts = Record<string, number>;

const card = "rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900";

function Step({ n, title, big, bigLabel, lines, auto, href, active }: { n: number; title: string; big: number; bigLabel: string; lines: { text: string; warn?: boolean }[]; auto: string; href: string; active: boolean }) {
  return (
    <Link href={href} className={`${card} block transition hover:shadow-sm ${active ? "ring-2 ring-slate-900/70 dark:ring-slate-100/70" : ""}`}>
      <p className="flex items-center gap-2 text-[12px] font-medium text-slate-500">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{n}</span> {title}
      </p>
      <p className="mt-2 text-[28px] font-semibold leading-none tabular-nums text-slate-900 dark:text-slate-100">{big.toLocaleString("en-IN")}</p>
      <p className="mt-1 text-[12px] text-slate-500">{bigLabel}</p>
      <ul className="mt-3 space-y-1 text-[12.5px]">
        {lines.map((l) => (
          <li key={l.text} className={l.warn ? "font-medium text-amber-700 dark:text-amber-300" : "text-slate-600 dark:text-slate-300"}>{l.text}</li>
        ))}
      </ul>
      <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-400 dark:border-slate-800">{auto}</p>
    </Link>
  );
}

const nowMs = () => Date.now();
const STAGES = ["registered", "read", "missing", "asking", "ready"] as const;
type Stage = (typeof STAGES)[number];

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const stage: Stage = (STAGES as readonly string[]).includes(sp.stage ?? "") ? (sp.stage as Stage) : "missing";

  const [{ data: countsData }, { count: openQuestions }] = await Promise.all([
    supabase.rpc("profile_pipeline_counts"),
    supabase.from("bot_questions").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);
  const c = (countsData ?? {}) as Counts;
  const n = (k: string) => Number(c[k] ?? 0);

  // The people behind the selected step.
  const cols = "id, full_name, profile_group, sub_group, readiness_score, readiness_tier, current_job_title, current_employer, current_fixed_ctc, expected_fixed_ctc, notice_period, current_location, city_canonical, open_to_relocation, resume_file_url, total_experience_years";
  let list: Record<string, unknown>[] = [];
  let listNote = "";
  if (stage === "registered") {
    const { data } = await supabase.from("candidates").select(cols).order("created_at", { ascending: false }).limit(40);
    list = data ?? [];
    listNote = "Newest registrations.";
  } else if (stage === "read") {
    const { data } = await supabase.from("candidates").select(cols).or("profile_group.eq.unclear,profile_group_needs_review.eq.true").order("created_at", { ascending: false }).limit(40);
    list = data ?? [];
    listNote = "Profiles the system isn't sure how to sort. Open one, pick the group, and it stays put.";
  } else if (stage === "missing") {
    const { data } = await supabase.from("candidates").select(cols).neq("readiness_tier", "ready").order("readiness_score", { ascending: false }).limit(40);
    list = data ?? [];
    listNote = "Closest to ready first. A few details each would make them match-ready.";
  } else if (stage === "asking") {
    const since = new Date(nowMs() - 14 * 86_400_000).toISOString();
    const { data: msgs } = await supabase.from("whatsapp_messages").select("candidate_id").eq("direction", "outbound").like("template_name", "profile_details%").gte("created_at", since).not("candidate_id", "is", null).limit(300);
    const ids = Array.from(new Set(((msgs ?? []) as { candidate_id: string }[]).map((m) => m.candidate_id))).slice(0, 40);
    const { data } = ids.length ? await supabase.from("candidates").select(cols).in("id", ids) : { data: [] };
    list = data ?? [];
    listNote = "Asked on WhatsApp in the last 14 days.";
  } else {
    const { data } = await supabase.from("candidates").select(cols).eq("readiness_tier", "ready").order("readiness_score", { ascending: false }).order("created_at", { ascending: false }).limit(40);
    list = data ?? [];
    listNote = "Ready: they are considered for every matching role.";
  }

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8">
      <CandidatesSubNav />
      <h1 className="ros-page-title">Profile pipeline</h1>
      <p className="mt-1 max-w-3xl text-[13px] text-slate-500">From registration to matching in five steps. Most of it runs by itself; this page shows where people are and what is waiting for you.</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Step n={1} title="Registered" big={n("registered")} bigLabel="profiles" lines={[{ text: `${n("registered_7d").toLocaleString("en-IN")} new this week` }]} auto="Automatic: website, WhatsApp, uploads" href="?stage=registered" active={stage === "registered"} />
        <Step
          n={2}
          title="Read and sorted"
          big={Math.max(0, n("registered") - n("unclassified"))}
          bigLabel="sorted"
          lines={[{ text: `${n("cv_unread")} CVs waiting to be read` }, { text: `${n("unclassified")} waiting to be sorted` }, { text: `${n("needs_a_look")} need a look`, warn: n("needs_a_look") > 0 }]}
          auto="Automatic: read and sorted overnight"
          href="?stage=read"
          active={stage === "read"}
        />
        <Step
          n={3}
          title="What's missing"
          big={n("missing_any")}
          bigLabel="profiles missing something"
          lines={[{ text: `${n("missing_current_ctc")} no current pay` }, { text: `${n("missing_notice")} no notice period` }, { text: `${n("missing_city")} no city` }, { text: `${n("missing_relocation")} relocation not asked` }]}
          auto="Shown on every profile"
          href="?stage=missing"
          active={stage === "missing"}
        />
        <Step
          n={4}
          title="Asking on WhatsApp"
          big={n("asked_waiting") + n("assistant_active")}
          bigLabel="conversations in progress"
          lines={[{ text: `${n("asked_waiting")} asked, no reply yet` }, { text: `${n("assistant_active")} with the assistant` }, { text: `${n("needs_a_person")} need a person`, warn: n("needs_a_person") > 0 }]}
          auto="You review a batch; the assistant takes it from there"
          href="?stage=asking"
          active={stage === "asking"}
        />
        <Step n={5} title="Match-ready" big={n("ready")} bigLabel="ready to match" lines={[{ text: `${n("ready_with_gaps")} more ready with gaps` }]} auto="Automatic: considered for every open role" href="?stage=ready" active={stage === "ready"} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <BatchPanel />
        <section className={card}>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-slate-100">
            <Bot className="h-4 w-4 text-teal-600" /> Teach the assistant
          </h2>
          <p className="mt-1 text-[13px] text-slate-500">Questions candidates asked that the assistant couldn&apos;t answer. Answer once and it replies next time.</p>
          <p className="mt-3 text-[26px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">{openQuestions ?? 0}</p>
          <p className="text-[12px] text-slate-500">waiting to be answered</p>
          <Link href="/whatsapp/training" className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-teal-700 hover:underline dark:text-teal-300">
            Answer them <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      </div>

      <section className="mt-6">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{{ registered: "Registered", read: "Needs a look", missing: "Missing details", asking: "Asked on WhatsApp", ready: "Match-ready" }[stage]}</h2>
        <p className="mb-3 text-[12.5px] text-slate-500">{listNote}</p>
        {list.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Check className="h-4 w-4 text-emerald-600" /> Nobody here right now.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
            {list.map((r) => {
              const missing = profileChecklist(r as never, true).filter((i) => !i.have);
              return (
                <li key={r.id as string}>
                  <Link target="_blank" rel="noopener noreferrer" href={`/candidates/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <span className="min-w-[160px] flex-1">
                      <span className="block text-[14px] font-medium text-slate-900 dark:text-slate-100">{(r.full_name as string) ?? "Unnamed"}</span>
                      <span className="block text-xs text-slate-500">{[r.current_job_title, r.current_employer].filter(Boolean).join(" at ") || "No role on file"}</span>
                    </span>
                    <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800 dark:bg-teal-950/40 dark:text-teal-200">{profileLabel(r.profile_group as string, r.sub_group as string) ?? "Not sorted yet"}</span>
                    <span className="text-xs text-slate-500">{missing.length === 0 ? "Complete" : `Missing: ${missing.slice(0, 3).map((m) => m.label.toLowerCase()).join(", ")}${missing.length > 3 ? ` +${missing.length - 3}` : ""}`}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
