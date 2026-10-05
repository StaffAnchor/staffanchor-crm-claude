"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, Check, ChevronDown, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ctcOptions, noticePeriodOptions, workModeOptions, relocationOptions } from "@/lib/candidate-options";

type Candidate = {
  id: string;
  status: string | null;
  phone: string | null;
  current_location: string | null;
  resume_file_url: string | null;
  current_employer: string | null;
  current_job_title: string | null;
  current_employment_status: string | null;
  total_experience_years: number | string | null;
  current_fixed_ctc: number | string | null;
  expected_fixed_ctc: number | string | null;
  notice_period: string | null;
  highest_qualification: string | null;
  category: string | null;
  sub_domain: string | null;
  work_mode: string | null;
  open_to_relocation: string | null;
  industries: string[] | null;
  segment_data: Record<string, unknown> | null;
  details_confirmed_at?: string | null;
};

const has = (v: unknown) => v !== null && v !== undefined && v !== "";

// Same field list as public.submit_candidate's completeness check, the
// authoritative gate for Lead / Awaiting input -> Registered.
function missingForRegistration(c: Candidate, v: { expected: string; workMode: string; notice: string; relocation: string }) {
  const m: string[] = [];
  if (!has(c.phone)) m.push("Phone");
  if (!has(c.current_location)) m.push("Current city");
  if (!has(c.resume_file_url)) m.push("Resume");
  if (!has(c.current_employer)) m.push("Current employer");
  if (!has(c.current_job_title)) m.push("Current job title");
  if (!has(c.current_employment_status)) m.push("Employment status");
  if (!has(c.total_experience_years)) m.push("Total experience");
  if (!has(c.current_fixed_ctc)) m.push("Current fixed CTC");
  if (!has(v.expected)) m.push("Expected fixed CTC");
  if (!has(v.notice)) m.push("Notice period");
  if (!has(c.highest_qualification)) m.push("Highest qualification");
  if (!has(c.category)) m.push("Profile type");
  if (!has(c.sub_domain)) m.push("What they sell / practice");
  if (!has(v.workMode)) m.push("Work mode");
  if (!has(v.relocation)) m.push("Open to relocation");
  if (!(c.industries?.length ?? 0)) m.push("Industries");
  return m;
}

function Chips({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const all = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(value === o ? "" : o)}
          className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
            value === o
              ? "border-teal-600 bg-teal-600 text-white"
              : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11.5px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">
        {label} {hint && <span className="font-normal text-slate-400">{hint}</span>}
      </p>
      {children}
    </div>
  );
}

export default function CallCompanion({
  candidate,
  doubts,
  recruiterName,
}: {
  candidate: Candidate;
  doubts: string[];
  recruiterName: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const seg = candidate.segment_data ?? {};
  const callConfirmed = seg.call_confirmed as { at?: string; by?: string } | undefined;

  const [expected, setExpected] = useState(has(candidate.expected_fixed_ctc) ? String(Number(candidate.expected_fixed_ctc)) : "");
  const [workMode, setWorkMode] = useState(candidate.work_mode ?? "");
  const [notice, setNotice] = useState(candidate.notice_period ?? "");
  const [relocation, setRelocation] = useState(candidate.open_to_relocation ?? "");
  const [offer, setOffer] = useState(typeof seg.offer_in_hand === "boolean" ? (seg.offer_in_hand ? "Yes" : "No") : "");
  const [offerCtc, setOfferCtc] = useState(typeof seg.offer_ctc === "number" ? String(seg.offer_ctc) : "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missing = missingForRegistration(candidate, { expected, workMode, notice, relocation });
  const incomplete = candidate.status === "lead" || candidate.status === "awaiting_input";
  const [open, setOpen] = useState(incomplete || !has(candidate.expected_fixed_ctc) || !has(candidate.work_mode) || !callConfirmed);

  async function save() {
    setError(null);
    if (offer === "Yes" && !offerCtc) {
      setError("Pick the offer CTC, or set offer in hand to No.");
      return;
    }
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const now = new Date().toISOString();

    const segmentData: Record<string, unknown> = { ...seg, call_confirmed: { at: now, by: recruiterName } };
    if (offer === "Yes") {
      segmentData.offer_in_hand = true;
      segmentData.offer_ctc = Number(offerCtc);
    } else if (offer === "No") {
      segmentData.offer_in_hand = false;
      delete segmentData.offer_ctc;
    }
    // A number now exists, so "negotiable" is no longer the only thing on record.
    const update: Record<string, unknown> = { segment_data: segmentData };
    if (expected) update.expected_fixed_ctc = Number(expected);
    if (workMode) update.work_mode = workMode;
    if (notice) update.notice_period = notice;
    if (relocation) update.open_to_relocation = relocation;

    const graduates = incomplete && missing.length === 0;
    if (graduates) update.status = "registered";

    const { error: updateError } = await supabase.from("candidates").update(update).eq("id", candidate.id);
    if (updateError) {
      setSaving(false);
      setError(updateError.message);
      return;
    }
    if (note.trim()) {
      await supabase.from("recruiter_notes").insert({
        candidate_id: candidate.id,
        author_id: user?.id,
        note_type: "call_note",
        content: note.trim(),
      });
    }
    await supabase.from("audit_log").insert({
      actor: user?.id,
      action: "call_companion_saved",
      entity: "candidate",
      entity_id: candidate.id,
      detail: { fields: Object.keys(update).filter((k) => k !== "segment_data"), registered: graduates },
    });
    setSaving(false);
    setNote("");
    router.refresh();
  }

  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-3 text-left">
        <span className="flex items-center gap-2 text-[14px] font-semibold text-slate-900 dark:text-slate-100">
          <Phone className="w-4 h-4 text-teal-600" /> Call companion
          <span className="text-[11.5px] font-normal text-slate-400">tap the answers during the call</span>
        </span>
        <span className="flex items-center gap-2">
          {callConfirmed?.at && (
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
              Confirmed on call {new Date(callConfirmed.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              {callConfirmed.by ? ` by ${callConfirmed.by}` : ""}
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,340px)] gap-6">
          <div className="space-y-4">
            <Row label="Expected fixed CTC" hint={seg.expected_ctc_negotiable === true ? "(said negotiable earlier)" : undefined}>
              <select
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2.5 py-1.5 text-[13px] w-44"
              >
                <option value="">Select</option>
                {ctcOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {has(candidate.current_fixed_ctc) && (
                <span className="ml-2 text-[11.5px] text-slate-400">current fixed: {Number(candidate.current_fixed_ctc)} LPA</span>
              )}
            </Row>
            <Row label="Notice period / days to join">
              <Chips value={notice} options={noticePeriodOptions} onChange={setNotice} />
            </Row>
            <Row label="Preferred work mode">
              <Chips value={workMode} options={workModeOptions} onChange={setWorkMode} />
            </Row>
            <Row label="Open to relocate?">
              <Chips value={relocation} options={relocationOptions} onChange={setRelocation} />
            </Row>
            <Row label="Offer in hand?">
              <div className="flex flex-wrap items-center gap-3">
                <Chips value={offer} options={["Yes", "No"]} onChange={setOffer} />
                {offer === "Yes" && (
                  <select
                    value={offerCtc}
                    onChange={(e) => setOfferCtc(e.target.value)}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2.5 py-1.5 text-[13px] w-40"
                  >
                    <option value="">Offer CTC</option>
                    {ctcOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </Row>
            <Row label="Call note" hint="(optional, saved to notes)">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2.5 py-1.5 text-[13px]"
                placeholder="Anything worth remembering from the call"
              />
            </Row>

            {error && (
              <p className="flex items-center gap-1.5 text-[12.5px] text-rose-600">
                <AlertCircle className="w-3.5 h-3.5" /> {error}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-60 text-white text-[13px] font-medium px-3.5 py-2"
              >
                <Check className="w-3.5 h-3.5" /> {saving ? "Saving..." : "Save call answers"}
              </button>
              {incomplete &&
                (missing.length === 0 ? (
                  <span className="text-[12px] text-emerald-600 dark:text-emerald-400">Saving these will mark this candidate Registered.</span>
                ) : (
                  <span className="text-[12px] text-amber-600 dark:text-amber-400">
                    Still needed to register: {missing.join(", ")}.
                  </span>
                ))}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-4 h-fit">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Ask about</p>
            {doubts.length === 0 ? (
              <p className="text-[12.5px] text-slate-500 dark:text-slate-400">Nothing flagged from the CV.</p>
            ) : (
              <ul className="space-y-2">
                {doubts.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12.5px] leading-5 text-slate-700 dark:text-slate-300">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                    {d}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
