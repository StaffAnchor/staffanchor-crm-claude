import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Briefcase, CalendarClock, Hourglass, IndianRupee, MessageCircle, Reply, Trophy, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { loadTodayDesk } from "@/lib/today-desk";
import { loadClientReplies, type ClientReply } from "@/lib/client-replies";
import { loadWaiting, type WaitingItem } from "@/lib/waiting-queue";
import { inr, loadFees, loadPlaced, type PlacedResult } from "@/lib/anchor/data";
import AnchorBox from "@/components/anchor/anchor-box";

export const dynamic = "force-dynamic";

type Tone = "urgent" | "attention" | "calm";
const TONE: Record<Tone, string> = {
  urgent: "border-rose-200 bg-rose-50/40 dark:border-rose-900 dark:bg-rose-950/20",
  attention: "border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20",
  calm: "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900",
};
const ICON_TONE: Record<Tone, string> = {
  urgent: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  attention: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  calm: "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
};

// One independent box per area: the number that matters, one line of why, and a page of its own that opens in a new tab.
function Box({ href, icon: Icon, title, value, sub, tone = "calm" }: { href: string; icon: LucideIcon; title: string; value: string; sub: string; tone?: Tone }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`group flex flex-col justify-between rounded-ros-xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ros-focusable ${TONE[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${ICON_TONE[tone]}`}><Icon className="h-[18px] w-[18px]" aria-hidden /></span>
        <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-teal-600" aria-hidden />
      </div>
      <div className="mt-4">
        <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400">{title}</p>
        <p className="mt-0.5 text-[28px] font-semibold leading-tight tracking-tight tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
        <p className="mt-1 line-clamp-2 text-[13px] text-slate-500 dark:text-slate-400">{sub}</p>
      </div>
    </a>
  );
}

const age = (h: number) => (h >= 24 ? `${Math.floor(h / 24)} days` : `${h} hours`);

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("full_name, email, role").eq("id", user.id).single();
  const name = profile?.full_name ?? (profile?.email ? profile.email.split("@")[0] : null);
  const isAdmin = profile?.role === "admin";
  const admin = adminDb();

  const noReplies: { items: ClientReply[]; unseen: number } = { items: [], unseen: 0 };
  const noWaiting: WaitingItem[] = [];
  const noPlaced: PlacedResult = { rows: [], counts: { "30": 0, "60": 0, "90": 0, life: 0 } };
  const [desk, replies, waiting, placed, fees] = await Promise.all([
    loadTodayDesk(supabase, user.id, name),
    loadClientReplies(supabase).catch(() => noReplies),
    admin ? loadWaiting(admin).catch(() => noWaiting) : Promise.resolve(noWaiting),
    loadPlaced(supabase, 30).catch(() => noPlaced),
    isAdmin && admin ? loadFees(admin, 30).catch(() => null) : Promise.resolve(null),
  ]);

  const decisions = desk.decisions.length + desk.moreDecisions;
  const employers = waiting.filter((w) => w.kind === "employer").length;
  const oldest = waiting.reduce((m, w) => Math.max(m, w.hoursWaiting), 0);
  const passes = replies.items.filter((r) => r.kind === "not_interested" && r.unseen).length;
  const likes = replies.items.filter((r) => (r.kind === "interested" || r.kind === "interview_requested") && r.unseen).length;
  const behind = desk.roles.filter((r) => r.health === "behind");
  const slow = desk.roles.filter((r) => r.health === "slow");
  const need = waiting.length + replies.unseen + decisions;
  const firstName = desk.firstName || "there";

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="ros-page-title">{desk.greeting}, {firstName}</h1>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
            {need === 0 ? "Nothing is waiting on you. A good moment to find new candidates." : `${need} ${need === 1 ? "thing needs" : "things need"} you: ${waiting.length} waiting for a reply, ${replies.unseen} new client ${replies.unseen === 1 ? "reply" : "replies"}, ${decisions} ${decisions === 1 ? "role needs" : "roles need"} a decision.`}
          </p>
        </div>
      </header>

      <section className="mb-6 rounded-ros-xl border border-teal-100 bg-gradient-to-b from-teal-50/60 to-white p-4 sm:p-5 dark:border-teal-950 dark:from-teal-950/20 dark:to-slate-900">
        <p className="mb-2.5 text-[13px] font-medium uppercase tracking-wide text-teal-700 dark:text-teal-300">Anchor, your assistant</p>
        <AnchorBox firstName={firstName} isAdmin={isAdmin} variant="hero" />
      </section>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Box
          href="/home/everything#waiting"
          icon={Reply}
          title="Reply to people"
          value={String(waiting.length)}
          sub={waiting.length === 0 ? "Everyone has an answer." : `${employers ? `${employers} ${employers === 1 ? "employer" : "employers"} first. ` : ""}Oldest has waited ${age(oldest)}.`}
          tone={employers > 0 ? "urgent" : waiting.length > 0 ? "attention" : "calm"}
        />
        <Box
          href="/home/everything#client-replies"
          icon={MessageCircle}
          title="Client replies"
          value={String(replies.unseen)}
          sub={replies.unseen === 0 ? "No new replies from employers." : `${likes} interested${passes ? `, ${passes} ${passes === 1 ? "pass" : "passes"}` : ""} in the last 14 days.`}
          tone={replies.unseen > 0 ? "attention" : "calm"}
        />
        <Box
          href="/home/everything#decisions"
          icon={Briefcase}
          title="Needs a decision"
          value={String(decisions)}
          sub={desk.decisions[0] ? desk.decisions[0].title : "All roles are set up and moving."}
          tone={desk.decisions.some((d) => d.tone === "urgent") ? "urgent" : decisions > 0 ? "attention" : "calm"}
        />
        <Box
          href="/home/everything#roles"
          icon={Hourglass}
          title="Roles behind"
          value={String(behind.length)}
          sub={behind.length === 0 ? `${slow.length} slow, none behind.` : `${behind.slice(0, 2).map((r) => r.role).join(", ")}${behind.length > 2 ? ` and ${behind.length - 2} more` : ""}. ${slow.length} more are slow.`}
          tone={behind.length > 0 ? "attention" : "calm"}
        />
        <Box
          href="/home/placements"
          icon={Trophy}
          title="Placed, last 30 days"
          value={String(placed.counts["30"] ?? 0)}
          sub={`${placed.counts["90"] ?? 0} in 90 days · ${placed.counts.life ?? 0} all time`}
        />
        {isAdmin ? (
          <Box
            href="/home/fees"
            icon={IndianRupee}
            title="Fees still to collect"
            value={fees ? inr(fees.outstanding) : "—"}
            sub={fees ? `${fees.collectedCount ? `${inr(fees.collected)} collected in 30 days. ` : "Nothing collected in 30 days. "}${fees.overdueCount ? `${fees.overdueCount} overdue.` : "None overdue."}` : "Could not load fees."}
            tone={fees && fees.overdueCount > 0 ? "attention" : "calm"}
          />
        ) : (
          <Box
            href="/interviews"
            icon={CalendarClock}
            title="Interviews today"
            value={String(desk.metrics.interviewsToday.count)}
            sub={desk.metrics.interviewsToday.names.slice(0, 2).join(", ") || `${desk.metrics.offersOpen} offers open`}
          />
        )}
      </div>

      {desk.decisions.length > 0 && (
        <section className="rounded-ros-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <header className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-4">
            <h2 className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">Do these next</h2>
            <a href="/home/everything" target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium text-teal-700 dark:text-teal-300">See everything ↗</a>
          </header>
          <ul>
            {desk.decisions.slice(0, 3).map((d) => (
              <li key={d.id} className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:gap-3 dark:border-slate-800">
                <span className={`hidden h-2 w-2 shrink-0 rounded-full sm:block ${d.tone === "urgent" ? "bg-rose-500" : d.tone === "attention" ? "bg-amber-500" : "bg-slate-400"}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium text-slate-900 dark:text-slate-100">{d.title}</p>
                  <p className="text-[13px] text-slate-500 dark:text-slate-400">{d.detail}</p>
                </div>
                <Link href={d.href} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-slate-200 px-3 py-1.5 text-[14px] font-medium text-slate-800 hover:bg-slate-50 sm:self-auto dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800">
                  {d.actionLabel}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
