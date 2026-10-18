import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type W = Record<string, number | null>;

const RANGES = [7, 30, 90];

function pct(a: number, b: number) {
  return b > 0 ? Math.round((a / b) * 100) : null;
}

// One number, how it moved against the period before, and how many cases it rests on. Nothing is shown as a verdict when
// there are too few cases to judge.
function Tile({ label, value, unit, cur, prev, better, n, note }: { label: string; value: string; unit?: string; cur?: number | null; prev?: number | null; better?: "up" | "down"; n?: string; note?: string }) {
  let delta: { text: string; good: boolean } | null = null;
  if (cur != null && prev != null && better && prev !== cur) {
    const up = cur > prev;
    delta = { text: `${up ? "▲" : "▼"} ${Math.abs(Math.round((cur - prev) * 10) / 10)}${unit === "%" ? " pts" : ""} vs before`, good: (better === "up") === up };
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-[12px] text-slate-500">{label}</p>
      <p className="mt-1 text-[28px] font-semibold leading-none tabular-nums text-slate-900 dark:text-slate-100">
        {value}
        {unit && value !== "–" && <span className="ml-1 text-[14px] font-medium text-slate-500">{unit}</span>}
      </p>
      {delta && <p className={`mt-1.5 text-[12px] font-medium ${delta.good ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>{delta.text}</p>}
      {n && <p className="mt-1 text-xs text-slate-400">{n}</p>}
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

export default async function ScoreboardPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.days)) ? Number(sp.days) : 30;
  const supabase = await createClient();
  const [{ data }, { data: tranches }] = await Promise.all([
    supabase.rpc("scoreboard", { p_days: days }),
    supabase.from("placement_fee_tranches").select("amount_lakhs").neq("status", "cancelled"),
  ]);
  const d = (data ?? {}) as { current?: W; prior?: W; stuck?: Record<string, number>; link_outcomes_missing?: { total: number; with_call_outcome: number } };
  const c = (d.current ?? {}) as W;
  const p = (d.prior ?? {}) as W;
  const stuck = d.stuck ?? {};
  const lo = d.link_outcomes_missing ?? { total: 0, with_call_outcome: 0 };
  const n = (w: W, k: string) => Number(w[k] ?? 0);
  const suspicious = ((tranches ?? []) as { amount_lakhs: number }[]).filter((t) => Number(t.amount_lakhs) > 1000).length;

  const toInt = (w: W) => pct(n(w, "to_interview"), n(w, "submitted"));
  const intToOffer = (w: W) => pct(n(w, "to_offer"), n(w, "to_interview"));
  const pickup = (w: W) => pct(n(w, "calls_spoke"), n(w, "calls"));
  const interest = (w: W) => pct(n(w, "calls_interested"), n(w, "calls_spoke"));
  const small = (count: number) => (count < 5 ? `Only ${count}: too few to judge` : `${count} in the period`);

  const days1 = c.median_days_to_first_shortlist;
  const replyMin = c.wa_median_reply_minutes;

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="text-[20px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">Scoreboard</h2>
          <p className="mt-0.5 max-w-2xl text-[13px] text-slate-500">The few numbers that say whether the right candidates are reaching clients, quickly. Each is compared with the {days} days before. Where there are too few cases, it says so instead of showing a verdict.</p>
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Link key={r} href={`?days=${r}`} className={`rounded-full border px-3 py-1 text-[12.5px] font-medium ${r === days ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300"}`}>
              {r} days
            </Link>
          ))}
        </div>
      </div>

      <h3 className="mb-2 mt-7 text-[13px] font-semibold uppercase tracking-wide text-slate-400">Reaching the client</h3>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Days to first shortlist" value={days1 != null ? String(days1) : "–"} unit="days" cur={days1} prev={p.median_days_to_first_shortlist} better="down" n={`Median, from ${n(c, "mandates_with_first_shortlist")} role${n(c, "mandates_with_first_shortlist") === 1 ? "" : "s"}`} note="From a role opening to the first candidate sent to the client" />
        <Tile label="Candidates sent to clients" value={String(n(c, "submitted"))} cur={n(c, "submitted")} prev={n(p, "submitted")} better="up" />
        <Tile label="Sent, then interviewed" value={toInt(c) != null ? String(toInt(c)) : "–"} unit="%" cur={toInt(c)} prev={toInt(p)} better="up" n={small(n(c, "submitted"))} note="Of those sent, the share a client chose to interview. This is the best single measure of accuracy." />
        <Tile label="Placements" value={String(n(c, "placements"))} cur={n(c, "placements")} prev={n(p, "placements")} better="up" n={`${n(c, "offers")} offer${n(c, "offers") === 1 ? "" : "s"} made`} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Interviewed, then offered" value={intToOffer(c) != null ? String(intToOffer(c)) : "–"} unit="%" cur={intToOffer(c)} prev={intToOffer(p)} better="up" n={small(n(c, "to_interview"))} />
        <Tile label="New roles opened" value={String(n(c, "mandates_opened"))} cur={n(c, "mandates_opened")} prev={n(p, "mandates_opened")} />
        <Tile label="New registrations" value={n(c, "registrations").toLocaleString("en-IN")} cur={n(c, "registrations")} prev={n(p, "registrations")} better="up" />
        <Tile label="Offers open now" value={String(stuck.offers_open ?? 0)} note="Worth a follow-up each" />
      </div>

      <h3 className="mb-2 mt-7 text-[13px] font-semibold uppercase tracking-wide text-slate-400">Speed and follow-through</h3>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="First reply on WhatsApp" value={replyMin != null ? (replyMin >= 120 ? String(Math.round((replyMin / 60) * 10) / 10) : String(replyMin)) : "–"} unit={replyMin != null && replyMin >= 120 ? "hours" : "min"} cur={replyMin} prev={p.wa_median_reply_minutes} better="down" n={`Median, from ${n(c, "wa_inbound")} messages in`} note="By the assistant or a person" />
        <Tile label="Messages with no reply for 24 h" value={String(n(c, "wa_no_reply_24h"))} cur={n(c, "wa_no_reply_24h")} prev={n(p, "wa_no_reply_24h")} better="down" />
        <Tile label="Calls logged" value={String(n(c, "calls"))} cur={n(c, "calls")} prev={n(p, "calls")} better="up" n={n(c, "calls_started_unlogged") ? `${n(c, "calls_started_unlogged")} started but not logged` : "Every call started was logged"} />
        <Tile label="Calls picked up" value={pickup(c) != null ? String(pickup(c)) : "–"} unit="%" cur={pickup(c)} prev={pickup(p)} better="up" n={small(n(c, "calls"))} note={interest(c) != null ? `${interest(c)}% of those spoken to were interested` : undefined} />
      </div>

      <h3 className="mb-2 mt-7 text-[13px] font-semibold uppercase tracking-wide text-slate-400">Where it is stuck</h3>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Clients silent 5+ days" value={String(stuck.client_silent ?? 0)} note="Candidates sent, no answer" />
        <Tile label="Open roles with nothing sent" value={String(stuck.no_submission_7d ?? 0)} note="Open 7+ days, no candidate with the client" />
        <Tile label="Sourced and untouched 30+ days" value={String(stuck.sourced_over_30d ?? 0)} note="On a role but never moved" />
        <Tile label="Pipeline with a call outcome" value={lo.total ? String(pct(lo.with_call_outcome, lo.total)) : "–"} unit="%" n={`${lo.with_call_outcome} of ${lo.total}`} note="The more that is logged, the better every number here gets" />
      </div>

      <h3 className="mb-2 mt-7 text-[13px] font-semibold uppercase tracking-wide text-slate-400">Money</h3>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Fees booked" value={String(n(c, "fees_booked_lakhs"))} unit="lakh" />
        <Tile label="Fees invoiced" value={String(n(c, "fees_invoiced_lakhs"))} unit="lakh" />
        <Tile label="Fees collected" value={String(n(c, "fees_collected_lakhs"))} unit="lakh" />
      </div>
      {suspicious > 0 && (
        <p className="mt-3 max-w-3xl rounded-lg bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {suspicious} fee amount{suspicious === 1 ? "" : "s"} on record {suspicious === 1 ? "is" : "are"} above 1,000 lakh (for example 24,990). That looks like rupees entered in a lakh field. Check them under Billing; money numbers here and in Billing are only as right as those entries.
        </p>
      )}
    </div>
  );
}
