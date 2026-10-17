"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Plus, Star, Flag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ProfileGroupBadge } from "../profile-group-badge";
import ResumePreview from "../[id]/resume-preview";
import { MISSING_LABEL, TIER_PILL, type ReadinessTier } from "@/lib/readiness";
import SaveToList from "./save-to-list";
import WhatsAppMenu from "@/components/whatsapp-menu";
import { candidateTemplates } from "@/lib/whatsapp-link";
import { useMyFirstName } from "@/lib/use-my-name";
import type { ShortlistSummary } from "@/lib/shortlists";

export type TalentCardData = {
  id: string;
  candidate_number: number | null;
  full_name: string;
  headline: string;
  city: string | null;
  experience: number | null;
  current_ctc: number | null;
  expected_ctc: number | null;
  notice: string | null;
  group: string | null;
  subgroup: string | null;
  needs_review: boolean;
  readiness_score: number | null;
  readiness_tier: string | null;
  readiness_missing: string[];
  industries: string[];
  highlight: string | null;
  chips: string[];
  rating: "strong" | "weak" | null;
  role_fit?: { count: number; strong: number; roles: { mandateId: string; title: string; fit: string; score: number }[] } | null;
  has_email: boolean;
  phone: string | null;
  resume_file_url: string | null;
  resume_signed_url: string | null;
};

export type MandateOption = { id: string; role_title: string; city: string | null };

const lpa = (v: number | null) => (v === null || v === undefined || v === 0 ? null : `${v} LPA`);
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      {value ? <div className="truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">{value}</div> : <div className="text-[13px] text-slate-300 dark:text-slate-600" title="Not on file">—</div>}
    </div>
  );
}

export default function TalentCard({ c, mandates, lists = [], memberOf = [] }: { c: TalentCardData; mandates: MandateOption[]; lists?: ShortlistSummary[]; memberOf?: string[] }) {
  const [target, setTarget] = useState("");
  const [state, setState] = useState<"idle" | "adding" | "added" | "exists" | "error">("idle");
  const tier = (c.readiness_tier ?? "needs_work") as ReadinessTier;
  const missing = c.readiness_missing.map((k) => MISSING_LABEL[k] ?? k);
  const me = useMyFirstName();

  async function add() {
    if (!target) return;
    setState("adding");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("candidate_mandate_links").insert({
      candidate_id: c.id,
      mandate_id: target,
      added_by: user?.id ?? null,
      match_source: "talent_board",
      matched_at: new Date().toISOString(),
    });
    if (!error) setState("added");
    else setState(error.code === "23505" ? "exists" : "error");
  }
  const targetRole = mandates.find((m) => m.id === target)?.role_title;

  return (
    <article className="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-ros-sm transition duration-150 hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-teal-700">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-100 to-teal-100 text-[14px] font-bold text-teal-700 dark:from-teal-950 dark:to-teal-950 dark:text-teal-300">{initials(c.full_name)}</div>
        <div className="min-w-0 flex-1">
          <Link href={`/candidates/${c.id}`} className="block truncate text-[15px] font-semibold text-slate-900 hover:text-teal-700 dark:text-slate-100">
            {c.full_name}
          </Link>
          <p className="truncate text-[12.5px] text-slate-500 dark:text-slate-400">{c.headline || "Role not on file"}</p>
          <p className="truncate text-[12px] text-slate-400">{[c.city, c.candidate_number ? `C-${String(c.candidate_number).padStart(6, "0")}` : null].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ${TIER_PILL[tier]}`}
            title={missing.length ? `Missing: ${missing.join(", ")}` : "Nothing missing"}
          >
            {c.readiness_score ?? "—"}
          </span>
          {c.rating === "strong" && (
            <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-700">
              <Star className="h-3 w-3" /> Strong
            </span>
          )}
          {c.rating === "weak" && (
            <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-rose-700">
              <Flag className="h-3 w-3" /> Weak
            </span>
          )}
        </div>
      </div>

      <div className="mt-3">
        <ProfileGroupBadge group={c.group} subgroup={c.subgroup} needsReview={c.needs_review} />
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
        <Fact label="Exp" value={c.experience !== null ? `${c.experience} yrs` : null} />
        <Fact label="Current" value={lpa(c.current_ctc)} />
        <Fact label="Expected" value={lpa(c.expected_ctc)} />
        <Fact label="Notice" value={c.notice} />
      </div>

      {c.highlight && <p className="mt-3 line-clamp-2 text-[12.5px] leading-snug text-slate-700 dark:text-slate-300">{c.highlight}</p>}

      {c.role_fit && c.role_fit.roles.length > 0 && (
        <div className="mt-2.5 rounded-lg bg-teal-50/70 px-2.5 py-2 dark:bg-teal-950/20">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
            Fits {c.role_fit.count} open {c.role_fit.count === 1 ? "role" : "roles"}
            {c.role_fit.strong > 0 ? ` · ${c.role_fit.strong} strong` : ""}
          </p>
          <div className="flex flex-wrap gap-1">
            {c.role_fit.roles.map((r) => (
              <Link
                key={r.mandateId}
                href={`/mandates/${r.mandateId}`}
                className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                  r.fit === "strong" ? "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800" : "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800"
                }`}
                title={`${r.fit === "strong" ? "Strong" : "Possible"} fit, score ${r.score}`}
              >
                <span className="truncate">{r.title}</span>
                <span className="shrink-0 tabular-nums opacity-80">{r.score}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {(c.chips.length > 0 || c.industries.length > 0) && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {[...c.chips, ...c.industries].slice(0, 6).map((t, i) => (
            <span key={`${t}-${i}`} className="rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800" style={{ marginTop: "0.9rem" }}>
        <SaveToList candidateId={c.id} lists={lists} memberOf={memberOf} />
        {c.resume_signed_url && <ResumePreview signedUrl={c.resume_signed_url} fileName={(c.resume_file_url ?? `${c.full_name}-resume`).replace(/^resumes\//, "")} label="CV" />}
        <WhatsAppMenu
          phone={c.phone}
          templates={candidateTemplates(c.full_name, { me, candidateId: c.id, missing: c.readiness_missing }).filter((t) => t.key !== "intro")}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50"
        />
        <Link href={`/candidates/${c.id}`} className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:ring-slate-700">
          Open
        </Link>
      </div>

      {mandates.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {state === "added" ? (
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700">
              <Check className="h-3.5 w-3.5" /> Added to {targetRole ?? "the mandate"}
            </span>
          ) : state === "exists" ? (
            <span className="text-[12px] text-slate-500">Already in that pipeline</span>
          ) : (
            <>
              <select value={target} onChange={(e) => setTarget(e.target.value)} className="min-w-0 max-w-[190px] flex-1 rounded-md border border-slate-300 bg-transparent px-2 py-1 text-[12px] dark:border-slate-700">
                <option value="">Add to a mandate…</option>
                {mandates.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.role_title}
                    {m.city ? ` · ${m.city}` : ""}
                  </option>
                ))}
              </select>
              <button onClick={add} disabled={!target || state === "adding"} className="inline-flex items-center gap-1 rounded-full bg-teal-600 px-3 py-1 text-[12px] font-semibold text-white hover:bg-teal-500 disabled:opacity-50">
                <Plus className="h-3 w-3" /> {state === "adding" ? "Adding…" : "Add"}
              </button>
              {state === "error" && <span className="text-[12px] text-rose-600">Couldn&apos;t add</span>}
            </>
          )}
        </div>
      )}
    </article>
  );
}
