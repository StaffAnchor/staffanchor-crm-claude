"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MessageCircle, UserPlus } from "lucide-react";
import LazyCvPreview from "./lazy-cv-preview";
import NotAFitMenu from "./not-a-fit-menu";
import PipelineTemplateActions from "./pipeline-template-actions";
import WriteWhatsAppButton from "./write-whatsapp-button";
import WhatsAppReview from "@/components/whatsapp-review";
import { useWhatsAppTemplates } from "@/lib/use-whatsapp-templates";
import { POOL_TIER_LABEL, POOL_TIER_PILL, type PoolTier } from "@/lib/talent-pool";
import type { Ranked } from "@/lib/role-match";

const GROUPS: { key: Ranked["bucket"]; label: string; blurb: string; tone: string }[] = [
  { key: "perfect", label: "Perfect", blurb: "Does this job today, sells the right thing, and city, pay and experience all line up.", tone: "bg-emerald-600" },
  { key: "close", label: "Close", blurb: "Nothing important is off. A nearby city, a little over on pay or experience, or pay still to confirm on a call.", tone: "bg-teal-600" },
  { key: "stretch", label: "Stretch", blurb: "More is different, but worth a look.", tone: "bg-slate-500" },
];

const PER_PAGE = 15;

const MISSING_LABEL: Record<string, string> = { current_ctc: "current pay", expected_ctc: "expected pay", notice: "notice period", industries: "industries", cv_unread: "CV not read", current_employer: "company", relocation: "relocation", city: "city" };
const missingText = (m: string[] | null | undefined) => (m ?? []).slice(0, 3).map((k) => MISSING_LABEL[k] ?? k.replace(/_/g, " ")).join(", ");

const REACHED_LABEL: Record<string, string> = { sent: "Messaged", interested: "Said yes", not_now: "Not now" };
const REACHED_STYLE: Record<string, string> = {
  sent: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  interested: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  not_now: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
};

type Where = "all" | "here" | "reloc" | "unknown";
const RELOC_OK = new Set(["Yes", "Maybe", "Depends upon Option"]);

export default function RankedGroups({ mandateId, roleTitle = null, ranked: allRanked, reached = {}, cities = [] }: { mandateId: string; roleTitle?: string | null; ranked: Ranked[]; reached?: Record<string, { status: string; at: string }>; cities?: string[] }) {
  const router = useRouter();
  const flags = useWhatsAppTemplates();
  const [reviewing, setReviewing] = useState(false);
  // Where they are, for a role tied to a city: in the city, elsewhere but open to moving, or elsewhere with no answer yet.
  const [where, setWhere] = useState<Where>("all");
  const placeOf = (r: Ranked): Exclude<Where, "all"> => (r.metro && cities.includes(r.metro) ? "here" : RELOC_OK.has(r.row.open_to_relocation ?? "") ? "reloc" : "unknown");
  const whereCounts = useMemo(() => {
    const n = { here: 0, reloc: 0, unknown: 0 };
    for (const r of allRanked) n[placeOf(r)]++;
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRanked, cities]);
  const ranked = useMemo(
    () => (where === "all" ? allRanked : allRanked.filter((r) => placeOf(r) === where)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRanked, where, cities]
  );
  const counts = useMemo(() => Object.fromEntries(GROUPS.map((g) => [g.key, ranked.filter((r) => r.bucket === g.key).length])) as Record<Ranked["bucket"], number>, [ranked]);
  const first = (GROUPS.find((g) => counts[g.key] > 0) ?? GROUPS[0]).key;
  const [tab, setTab] = useState<Ranked["bucket"]>(first);
  const [shown, setShown] = useState(PER_PAGE);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [why, setWhy] = useState<Set<string>>(new Set());
  const [gone, setGone] = useState<Set<string>>(new Set());

  async function dismiss(candidateId: string, reason: string) {
    if (!reason) return;
    setGone((g) => new Set(g).add(candidateId));
    const res = await fetch(`/api/mandates/${mandateId}/dismiss`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidate_id: candidateId, reason }) });
    if (!res.ok) {
      setGone((g) => new Set([...g].filter((x) => x !== candidateId)));
      setMsg("Couldn't save that reason, so the person was not removed. Try again.");
    }
  }

  // Local people come first within a group when the role is tied to a city; otherwise the order is the score.
  const list = ranked
    .filter((r) => r.bucket === tab && !gone.has(r.row.candidate_id))
    .sort((a, b) => (cities.length ? Number(placeOf(b) === "here") - Number(placeOf(a) === "here") : 0) || b.score - a.score);

  async function addPicked() {
    const chosen = ranked.filter((r) => picked.has(r.row.candidate_id));
    if (chosen.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/mandates/${mandateId}/role-card/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates: chosen.map((r) => ({ id: r.row.candidate_id, score: r.score, note: r.matched.slice(0, 3).join("; ") })) }),
      });
      const d = await res.json().catch(() => ({}));
      setMsg(res.ok ? `Added ${d.added} to the pipeline.` : d.error ?? "Couldn't add.");
      setPicked(new Set());
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  // The best people nobody has messaged about this role yet: the Perfect group, up to 15.
  const readyToReach = ranked.filter((r) => r.bucket === "perfect" && !reached[r.row.candidate_id]).slice(0, 15);
  const selectReady = () => {
    setTab("perfect");
    setPicked(new Set(readyToReach.map((r) => r.row.candidate_id)));
  };
  const reachIds = ranked.filter((r) => picked.has(r.row.candidate_id)).map((r) => r.row.candidate_id);
  const post = (body: Record<string, unknown>) =>
    fetch("/api/whatsapp/role-opportunity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mandateId, candidateIds: reachIds, ...body }) }).then(async (r) => ({ res: r, d: await r.json().catch(() => ({})) }));

  const toggle = (id: string) => setPicked((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : new Set(p).add(id)));

  return (
    <div className="space-y-3">
      {cities.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
          <span className="font-medium text-slate-500">Where they are:</span>
          {(
            [
              { k: "all", label: "Everyone", n: allRanked.length },
              { k: "here", label: `In ${cities.join(" / ")}`, n: whereCounts.here },
              { k: "reloc", label: "Elsewhere, open to moving", n: whereCounts.reloc },
              { k: "unknown", label: "Elsewhere, not asked yet", n: whereCounts.unknown },
            ] as { k: Where; label: string; n: number }[]
          ).map((o) => (
            <button
              key={o.k}
              type="button"
              onClick={() => {
                setWhere(o.k);
                setShown(PER_PAGE);
              }}
              className={`rounded-full border px-3 py-1 font-medium ${where === o.k ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}
            >
              {o.label} <span className="opacity-70">{o.n}</span>
            </button>
          ))}
          {where === "unknown" && <span className="text-slate-400">They have not said whether they would relocate. Ask on a call.</span>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {GROUPS.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => {
              setTab(g.key);
              setShown(PER_PAGE);
            }}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[13px] font-semibold ${tab === g.key ? `${g.tone} border-transparent text-white` : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}
          >
            {g.label} <span className={`rounded-full px-1.5 text-xs ${tab === g.key ? "bg-white/20" : "bg-slate-100 text-slate-600 dark:bg-slate-800"}`}>{counts[g.key]}</span>
          </button>
        ))}
        <p className="text-[12px] text-slate-500">{GROUPS.find((g) => g.key === tab)?.blurb}</p>
        <div className="ml-auto flex items-center gap-2">
          {msg && <span className="text-[12px] text-slate-500">{msg}</span>}
          {flags?.opportunity && (
            <button type="button" onClick={() => setReviewing(true)} disabled={picked.size === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
              <MessageCircle className="h-3.5 w-3.5" /> Review &amp; WhatsApp {picked.size || ""}
            </button>
          )}
          <button type="button" onClick={addPicked} disabled={busy || picked.size === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />} Add {picked.size || ""} to pipeline
          </button>
        </div>
      </div>

      {readyToReach.length > 0 && flags?.opportunity && picked.size === 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 dark:border-teal-900 dark:bg-teal-950/30">
          <p className="flex-1 text-sm text-slate-800 dark:text-slate-100">
            <span className="font-semibold">{readyToReach.length} Perfect match{readyToReach.length === 1 ? "" : "es"}</span> {readyToReach.length === 1 ? "hasn't" : "haven't"} heard about this role yet.
          </p>
          <button type="button" onClick={selectReady} className="text-sm font-semibold text-teal-700 hover:underline dark:text-teal-300">
            Select them
          </button>
        </div>
      )}

      {list.length === 0 && <p className="rounded-ros-lg border border-dashed border-slate-300 p-6 text-center text-[13px] text-slate-500 dark:border-slate-700">No one in this group yet. The card may be too narrow: try adding more &quot;also fine&quot; worlds or cities.</p>}

      <ul className="space-y-2">
        {list.slice(0, shown).map((r) => {
          const c = r.row;
          return (
            <li key={c.candidate_id} className="rounded-ros-xl border border-slate-200 bg-white p-3.5 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex gap-3">
                <input type="checkbox" checked={picked.has(c.candidate_id)} onChange={() => toggle(c.candidate_id)} aria-label={`Select ${c.full_name ?? "candidate"}`} className="mt-1.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link target="_blank" rel="noopener noreferrer" href={`/candidates/${c.candidate_id}`} className="text-[14px] font-semibold text-teal-700 hover:underline dark:text-teal-400">
                      {c.full_name ?? "Unnamed"}
                    </Link>
                    {c.pool_tier && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${POOL_TIER_PILL[c.pool_tier as PoolTier]}`}>Pool: {POOL_TIER_LABEL[c.pool_tier as PoolTier]}</span>}
                    <span className="text-[12px] tabular-nums text-slate-400">{r.score}</span>
                    {c.sub_group && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{c.sub_group}</span>}
                    {c.readiness_tier && c.readiness_tier !== "ready" && (c.readiness_missing?.length ?? 0) > 0 && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300" title="Not yet confirmed. Worth checking on the call.">
                        To confirm: {missingText(c.readiness_missing)}
                      </span>
                    )}
                    {reached[c.candidate_id] && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${REACHED_STYLE[reached[c.candidate_id].status] ?? REACHED_STYLE.sent}`}>
                        {REACHED_LABEL[reached[c.candidate_id].status] ?? "Messaged"}
                      </span>
                    )}
                  </div>
                  <p className="text-[12.5px] text-slate-500">
                    {[c.current_job_title, c.current_employer].filter(Boolean).join(" at ") || "No role on file"}
                    {r.metro ? ` · ${r.metro}` : ""}
                    {c.total_experience_years != null ? ` · ${Number(c.total_experience_years)} yrs` : ""}
                    {c.expected_fixed_ctc != null ? ` · expects ${Number(c.expected_fixed_ctc)} LPA` : c.current_fixed_ctc != null ? ` · ${Number(c.current_fixed_ctc)} LPA now` : ""}
                    {c.notice_period ? ` · notice ${c.notice_period}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {(why.has(c.candidate_id) ? r.matched : r.matched.slice(0, 2)).map((m) => (
                      <span key={m} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800 ring-1 ring-emerald-200/70 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-800/60">
                        <Check className="h-3 w-3" /> {m}
                      </span>
                    ))}
                    {(why.has(c.candidate_id) ? r.gaps : r.gaps.slice(0, 1)).map((g) => (
                      <span key={g} className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-800">
                        ⚠ {g}
                      </span>
                    ))}
                    {(r.matched.length > 2 || r.gaps.length > 1) && (
                      <button type="button" onClick={() => setWhy((w) => (w.has(c.candidate_id) ? new Set([...w].filter((x) => x !== c.candidate_id)) : new Set(w).add(c.candidate_id)))} className="text-xs font-medium text-teal-600 hover:underline">
                        {why.has(c.candidate_id) ? "Less" : `+${Math.max(0, r.matched.length - 2) + Math.max(0, r.gaps.length - 1)} more`}
                      </button>
                    )}
                  </div>
                </div>
                <div className="shrink-0 space-y-2">
                  <NotAFitMenu onPick={(reason) => dismiss(c.candidate_id, reason)} />
                  <LazyCvPreview candidateId={c.candidate_id} name={c.full_name} />
                  <WriteWhatsAppButton candidateId={c.candidate_id} name={c.full_name ?? "there"} role={roleTitle} />
                  <PipelineTemplateActions candidateId={c.candidate_id} mandateId={mandateId} stage="sourced" missing={[]} showOpportunity />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {list.length > shown && (
        <button type="button" onClick={() => setShown((s) => s + PER_PAGE)} className="text-[13px] font-medium text-teal-600 hover:underline">
          Show {Math.min(PER_PAGE, list.length - shown)} more of {list.length - shown}
        </button>
      )}
      {reviewing && (
        <WhatsAppReview
          title={`Tell ${reachIds.length} ${reachIds.length === 1 ? "person" : "people"} about this role`}
          loadPreview={async () => {
            const { d } = await post({ preview: true });
            if (d.ok === false || !d.preview) return { ok: false, error: d.error ?? "Couldn't prepare the messages." } as const;
            if (!d.preview.recipients || d.preview.recipients < 1) return { ok: false, error: "None of them can be messaged right now: opted out, no usable number, or already messaged in the last 30 days." } as const;
            return { ok: true, preview: d.preview } as const;
          }}
          send={async () => {
            const { res, d } = await post({});
            if (!res.ok || d.ok === false) return { ok: false, text: d.error ?? "That didn't work. Nothing was sent." };
            const skipped = (d.noPhone ?? 0) + (d.optedOut ?? 0) + (d.alreadySent ?? 0);
            return { ok: d.sent > 0, text: `Sent to ${d.sent}.${skipped ? ` Skipped ${skipped} (no usable number, opted out, or messaged in the last 30 days).` : ""}${d.over ? ` ${d.over} more were not included, 20 per send.` : ""}${d.failed ? ` ${d.failed} failed.` : ""}` };
          }}
          onDone={() => {
            setPicked(new Set());
            router.refresh();
          }}
          onClose={() => setReviewing(false)}
        />
      )}
    </div>
  );
}
