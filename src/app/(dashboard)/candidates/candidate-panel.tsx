"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, MessageCircle, Phone } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import PaidCallBadge from "@/components/paid-call-badge";
import { createClient } from "@/lib/supabase/client";
import { MISSING_LABEL } from "@/lib/readiness";
import type { PaidCall } from "@/lib/paid-calls";
import AddToRoleButton from "./[id]/add-to-role-button";
import AskMissingDetails from "./[id]/ask-missing-details";
import ResumeViewerInline from "./[id]/resume-viewer-inline";
import CallRecordForm, { type CallFormPerson } from "./call-record-form";
import { waHref } from "./candidate-list";
import type { CandidateRow, MandateLink, OpenMandate } from "./candidates-table";

export type PanelFocus = "overview" | "call" | "ask" | "role";

type Initial = NonNullable<Parameters<typeof CallRecordForm>[0]["initial"]>;
type History = { outcome: string | null; note: string | null; created_at: string };
const NOT_ANSWERS = ["call_confirmed", "call_insights", "revenue_snapshot", "offer_ctc", "offer_in_hand", "role_level", "role_type"];
const when = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

export default function CandidatePanel({
  c,
  focus,
  onClose,
  profileHref,
  openMandates,
  links,
  paid,
}: {
  c: CandidateRow & { resume_file_url?: string | null };
  focus: PanelFocus;
  onClose: () => void;
  profileHref: string;
  openMandates: OpenMandate[];
  links: MandateLink[];
  paid?: PaidCall;
}) {
  const router = useRouter();
  const [cv, setCv] = useState<string | null | undefined>(undefined);
  const [person, setPerson] = useState<{ p: CallFormPerson; initial: Initial; summary: string | null } | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [calling, setCalling] = useState(focus === "call");
  const [saved, setSaved] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const target = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: row, error }, { data: rating }, { data: log }] = await Promise.all([
      supabase.from("candidates").select("id, full_name, phone, email, total_experience_years, current_fixed_ctc, current_variable_ctc, expected_fixed_ctc, notice_period, current_location, open_to_relocation, work_mode, current_employer, current_job_title, current_employment_status, highest_qualification, resume_file_url, profile_group, sub_domain, segment_data").eq("id", c.id).maybeSingle(),
      supabase.from("candidate_call_ratings").select("communication, seriousness, stability, salary_realism, skill_match").eq("candidate_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("call_log").select("outcome, note, created_at").eq("candidate_id", c.id).order("created_at", { ascending: false }).limit(3),
    ]);
    if (error || !row) {
      setLoadError(true);
      return;
    }
    const { segment_data, ...fields } = row as Record<string, unknown> & { segment_data: Record<string, unknown> | null };
    const seg = segment_data ?? {};
    setPerson({
      p: {
        ...(fields as unknown as CallFormPerson),
        role_level: (seg.role_level as string | undefined) ?? null,
        role_type: (seg.role_type as string | undefined) ?? null,
        offer_in_hand: typeof seg.offer_in_hand === "boolean" ? seg.offer_in_hand : null,
        offer_ctc: Number(seg.offer_ctc) || null,
      },
      initial: { ratings: (rating ?? undefined) as Initial["ratings"], segment: Object.fromEntries(Object.entries(seg).filter(([k]) => !NOT_ANSWERS.includes(k))) },
      summary: (seg.call_insights as { summary?: string } | undefined)?.summary ?? null,
    });
    setHistory((log ?? []) as History[]);
  }, [c.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!c.resume_file_url) return;
    let off = false;
    fetch(`/api/calls/cv-url?id=${c.id}`)
      .then((r) => (r.ok ? r.json() : { url: null }))
      .then((d: { url: string | null }) => !off && setCv(d.url))
      .catch(() => !off && setCv(null));
    return () => {
      off = true;
    };
  }, [c.id, c.resume_file_url]);

  useEffect(() => {
    if (focus !== "overview") target.current?.scrollIntoView({ block: "start" });
  }, [focus]);

  const wa = waHref(c.phone);
  const missing = (c.readiness_missing ?? []).filter((m) => m !== "cv_read").map((m) => MISSING_LABEL[m] ?? m);
  if (!c.resume_file_url && !missing.includes(MISSING_LABEL.cv)) missing.push(MISSING_LABEL.cv);
  const linked = new Set(links.map((l) => l.mandate_id));
  const suggested = (c.role_fit?.top_roles ?? []).filter((r) => !linked.has(r.mandate_id));
  const head = "text-[13px] font-semibold text-slate-900 dark:text-slate-100";

  return (
    <Drawer open onClose={onClose} title={c.full_name} widthClassName="max-w-2xl">
      <div className="space-y-5">
        <div>
          <p className="text-[14px] text-slate-600 dark:text-slate-300">{[c.current_job_title, c.current_employer, c.current_location].filter(Boolean).join(" · ")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {paid && <PaidCallBadge call={paid} />}
            {c.phone && (
              <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-[14px] font-semibold text-white hover:bg-teal-800">
                <Phone className="h-3.5 w-3.5" /> {c.phone}
              </a>
            )}
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[14px] font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </a>
            )}
            <Link href={profileHref} className="ml-auto inline-flex items-center gap-1 text-[13px] font-medium text-teal-700 hover:underline">
              Full profile <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div ref={focus === "ask" ? target : undefined}>
          {missing.length > 0 && <AskMissingDetails candidateId={c.id} missing={missing} />}
        </div>

        <div ref={focus === "role" ? target : undefined} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className={head}>Roles</p>
            <AddToRoleButton candidateId={c.id} candidateName={c.full_name} roles={openMandates} linkedIds={links.map((l) => l.mandate_id)} />
          </div>
          {links.map((l) => (
            <Link key={l.mandate_id} href={`/mandates/${l.mandate_id}`} className="block text-[13px] text-slate-700 hover:underline dark:text-slate-300">
              On: {l.role_title} · {l.client_name}
            </Link>
          ))}
          {suggested.map((r) => (
            <Link key={r.mandate_id} href={`/mandates/${r.mandate_id}`} className="block text-[13px] text-slate-500 hover:underline">
              Could fit: {r.title} ({r.fit})
            </Link>
          ))}
          {links.length === 0 && suggested.length === 0 && <p className="text-[13px] text-slate-500">Not on any role yet.</p>}
        </div>

        <div ref={focus === "call" ? target : undefined} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className={head}>Calls</p>
            {!calling && person && (
              <button type="button" onClick={() => { setCalling(true); setSaved(null); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[14px] font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">
                Record a call
              </button>
            )}
          </div>
          {saved && <p className="text-[13px] font-medium text-emerald-700">{saved}</p>}
          {person?.summary && <p className="text-[13px] text-slate-600 dark:text-slate-300">{person.summary}</p>}
          {history.map((h) => (
            <p key={h.created_at} className="text-[13px] text-slate-500">
              {when(h.created_at)} · {(h.outcome ?? "").replace(/_/g, " ")}
              {h.note ? ` · ${h.note}` : ""}
            </p>
          ))}
          {person && history.length === 0 && <p className="text-[13px] text-slate-500">No call logged yet.</p>}
          {loadError && <p className="text-[13px] text-rose-600">Couldn&apos;t load the call details. Open the full profile instead.</p>}
          {calling && !person && !loadError && <p className="text-[13px] text-slate-500">Loading the call form…</p>}
          {calling && person && (
            <CallRecordForm
              p={person.p}
              initial={person.initial}
              mode="profile"
              onDone={(r) => {
                setCalling(false);
                setSaved(`Call saved for ${r.name}.`);
                void load();
                router.refresh();
              }}
            />
          )}
        </div>

        <div className="space-y-2">
          <p className={head}>CV</p>
          {!c.resume_file_url ? (
            <p className="text-[13px] text-slate-500">No CV on file.</p>
          ) : cv === undefined ? (
            <p className="text-[13px] text-slate-500">Opening the CV…</p>
          ) : cv ? (
            <div className="h-[70vh] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <ResumeViewerInline signedUrl={cv} fileName={c.resume_file_url.replace(/^resumes\//, "")} />
            </div>
          ) : (
            <p className="text-[13px] text-rose-600">The CV file could not be opened.</p>
          )}
        </div>
      </div>
    </Drawer>
  );
}
