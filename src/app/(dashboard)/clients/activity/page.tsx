import Link from "next/link";
import { CalendarClock, LogIn, ThumbsDown, ThumbsUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadClientReplies, type ClientReply } from "@/lib/client-replies";
import MarkSeenButton from "./mark-seen-button";

export const dynamic = "force-dynamic";

const KIND_TABS: { key: string; label: string }[] = [
  { key: "", label: "Everything" },
  { key: "interested", label: "Interested" },
  { key: "interview_requested", label: "Interview requests" },
  { key: "not_interested", label: "Passed" },
  { key: "login", label: "Sign-ins" },
];
const PERIODS = [7, 30, 90];

const KIND: Record<ClientReply["kind"], { icon: typeof LogIn; tone: string; verb: string }> = {
  interested: { icon: ThumbsUp, tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300", verb: "is interested in" },
  interview_requested: { icon: CalendarClock, tone: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300", verb: "wants to interview" },
  not_interested: { icon: ThumbsDown, tone: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300", verb: "passed on" },
  login: { icon: LogIn, tone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", verb: "signed in" },
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

// Everything employers did in the client portal, with filters. Today shows the latest few; this is the full list.
export default async function ClientActivityPage({ searchParams }: { searchParams: Promise<{ kind?: string; client?: string; days?: string }> }) {
  const sp = await searchParams;
  const days = PERIODS.includes(Number(sp.days)) ? Number(sp.days) : 30;
  const supabase = await createClient();
  const { items, unseen } = await loadClientReplies(supabase, { days, limit: 400, kind: sp.kind || undefined, clientId: sp.client || undefined });
  // The list of employers to filter by comes from the unfiltered window, so choosing one does not hide the others.
  const all = sp.client || sp.kind ? (await loadClientReplies(supabase, { days, limit: 400 })).items : items;
  const clients = Array.from(new Map(all.map((i) => [i.clientId, i.client ?? "Client"])).entries());

  const href = (o: { kind?: string; client?: string; days?: number }) => {
    const q = new URLSearchParams();
    const kind = o.kind ?? sp.kind;
    const client = o.client ?? sp.client;
    const d = o.days ?? days;
    if (kind) q.set("kind", kind);
    if (client) q.set("client", client);
    if (d !== 30) q.set("days", String(d));
    const s = q.toString();
    return s ? `/clients/activity?${s}` : "/clients/activity";
  };
  const chip = (on: boolean) => `rounded-full px-3 py-1 text-[13px] ${on ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`;

  const byDay = new Map<string, ClientReply[]>();
  for (const i of items) byDay.set(day(i.at), [...(byDay.get(day(i.at)) ?? []), i]);

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/clients" className="text-[13px] text-slate-500 hover:underline">← All clients</Link>
          <h1 className="mt-1 text-[24px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">Client activity</h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400">Every sign-in, interest, interview request and pass from the client portal{unseen ? `, ${unseen} new` : ""}.</p>
        </div>
        {unseen > 0 && <MarkSeenButton />}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {KIND_TABS.map((t) => (
          <Link key={t.key} href={href({ kind: t.key })} className={chip((sp.kind ?? "") === t.key)}>{t.label}</Link>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Link href={href({ client: "" })} className={chip(!sp.client)}>All clients</Link>
        {clients.map(([id, name]) => (
          <Link key={id} href={href({ client: id })} className={chip(sp.client === id)}>{name}</Link>
        ))}
        <span className="ml-auto flex items-center gap-1 text-[13px] text-slate-500">
          {PERIODS.map((p) => (
            <Link key={p} href={href({ days: p })} className={chip(days === p)}>{p} days</Link>
          ))}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="mt-8 rounded-xl border border-slate-200 bg-white p-6 text-[14px] text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">Nothing here for these filters.</p>
      ) : (
        <div className="mt-6 space-y-6">
          {Array.from(byDay.entries()).map(([d, list]) => (
            <section key={d}>
              <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-400">{d}</h2>
              <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                {list.map((r) => {
                  const k = KIND[r.kind];
                  const Icon = k.icon;
                  return (
                    <li key={r.id} className={`border-t border-slate-100 first:border-t-0 dark:border-slate-800 ${r.unseen ? "bg-teal-50/40 dark:bg-teal-950/10" : ""}`}>
                      <Link href={r.href} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${k.tone}`}>
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-medium text-slate-900 dark:text-slate-100">
                            {r.kind === "login" ? (
                              <>{r.who} <span className="font-normal text-slate-500">{k.verb}{r.client ? ` · ${r.client}` : ""}</span></>
                            ) : (
                              <>{r.client ?? "A client"} <span className="font-normal text-slate-500">{k.verb}</span> {r.candidate ?? "a candidate"}</>
                            )}
                          </p>
                          {r.kind !== "login" && (
                            <p className="text-[12.5px] text-slate-500 dark:text-slate-400">{[r.role, r.who !== "Someone" ? r.who : null].filter(Boolean).join(" · ")}</p>
                          )}
                          {r.extra && r.kind !== "login" && <p className="mt-0.5 text-[13px] text-slate-700 dark:text-slate-300">{r.extra}</p>}
                          {r.extra && r.kind === "login" && <p className="text-[12.5px] text-slate-500">{r.extra}</p>}
                        </div>
                        {r.unseen && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-teal-500" aria-label="New" />}
                        <span className="shrink-0 text-[12px] text-slate-400">{time(r.at)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
