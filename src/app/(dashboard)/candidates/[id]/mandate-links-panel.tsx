"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { STAGES, applyStageChange, joiningProgress, type Stage, type StageSource } from "@/lib/mandate-stage";

type Link = {
  id: string;
  mandate_id: string;
  stage: string;
  in_shortlist: boolean;
  rejection_reason: string | null;
  stage_source: StageSource | null;
  client_decision_at: string | null;
  rejected_from_stage: string | null;
  date_of_joining: string | null;
  mandates: { client_name: string; role_title: string } | null;
};

type Mandate = { id: string; client_name: string; role_title: string };

const SOURCE_BADGE: Record<StageSource, string> = {
  recruiter: "",
  client_relayed: "Client said (relayed) →",
  client_portal: "Client (portal) →",
  client_shortlist_link: "Client (shortlist link) →",
};

export default function MandateLinksPanel({
  candidateId,
  candidateName,
  links,
  openMandates,
}: {
  candidateId: string;
  candidateName: string;
  links: Link[];
  openMandates: Mandate[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [selectedMandate, setSelectedMandate] = useState("");
  const [linking, setLinking] = useState(false);
  // Per-link scratch state for the "who made this change" + extra-field flow,
  // keyed by link id, so each card's pending change is independent.
  const [pending, setPending] = useState<
    Record<string, { stage: Stage; clientRelayed: boolean; rejectionReason: string; dateOfJoining: string }>
  >({});
  const [saving, setSaving] = useState<string | null>(null);

  const linkedMandateIds = new Set(links.map((l) => l.mandate_id));
  const availableMandates = openMandates.filter((m) => !linkedMandateIds.has(m.id));

  async function handleLink() {
    if (!selectedMandate) return;
    setLinking(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("candidate_mandate_links").insert({
      candidate_id: candidateId,
      mandate_id: selectedMandate,
      added_by: user?.id,
    });
    setSelectedMandate("");
    setLinking(false);
    router.refresh();
  }

  function getPending(l: Link) {
    return (
      pending[l.id] ?? {
        stage: l.stage as Stage,
        clientRelayed: false,
        rejectionReason: l.rejection_reason ?? "",
        dateOfJoining: l.date_of_joining ?? "",
      }
    );
  }

  function setPendingFor(linkId: string, patch: Partial<{ stage: Stage; clientRelayed: boolean; rejectionReason: string; dateOfJoining: string }>) {
    setPending((prev) => ({ ...prev, [linkId]: { ...getPendingFromPrevOrLink(prev, linkId, links), ...patch } }));
  }

  function getPendingFromPrevOrLink(
    prev: typeof pending,
    linkId: string,
    allLinks: Link[]
  ) {
    if (prev[linkId]) return prev[linkId];
    const l = allLinks.find((x) => x.id === linkId)!;
    return { stage: l.stage as Stage, clientRelayed: false, rejectionReason: l.rejection_reason ?? "", dateOfJoining: l.date_of_joining ?? "" };
  }

  async function saveStage(l: Link) {
    const p = getPending(l);
    if (p.stage === l.stage && p.stage !== "rejected" && p.stage !== "placed") return;
    setSaving(l.id);
    try {
      const source: StageSource = p.clientRelayed ? "client_relayed" : "recruiter";
      await applyStageChange(supabase, {
        linkId: l.id,
        candidateId,
        mandateId: l.mandate_id,
        candidateName,
        mandateLabel: `${l.mandates?.role_title ?? "Role"} — ${l.mandates?.client_name ?? "Client"}`,
        previousStage: l.stage,
        newStage: p.stage,
        source,
        rejectionReason: p.stage === "rejected" ? p.rejectionReason : undefined,
        dateOfJoining: p.stage === "placed" ? p.dateOfJoining : undefined,
      });
      setPending((prev) => {
        const next = { ...prev };
        delete next[l.id];
        return next;
      });
      router.refresh();
    } finally {
      setSaving(null);
    }
  }

  async function toggleShortlist(linkId: string, current: boolean) {
    await supabase.from("candidate_mandate_links").update({ in_shortlist: !current }).eq("id", linkId);
    router.refresh();
  }

  return (
    <div>
      <div className="space-y-3 mb-4">
        {links.length === 0 && <p className="text-sm text-slate-400">Not linked to any mandate yet.</p>}
        {links.map((l) => {
          const p = getPending(l);
          const dirty = p.stage !== l.stage;
          const progress = l.stage === "placed" ? joiningProgress(l.date_of_joining) : null;
          return (
            <Card key={l.id} padded={false} className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{l.mandates?.role_title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{l.mandates?.client_name}</p>
                </div>
                <button
                  onClick={() => toggleShortlist(l.id, l.in_shortlist)}
                  className={`text-xs px-2 py-1 rounded-ros-full font-medium transition-all duration-200 ease-ros hover:-translate-y-px active:translate-y-0 active:scale-[0.98] ${
                    l.in_shortlist
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                  }`}
                >
                  {l.in_shortlist ? "In client shortlist" : "Add to shortlist"}
                </button>
              </div>

              {l.stage_source && l.stage_source !== "recruiter" && l.client_decision_at && (
                <p className="mt-2 text-[11px] font-medium text-amber-700 bg-amber-50 ring-1 ring-amber-200/60 rounded-ros-md px-2 py-1 inline-block">
                  {SOURCE_BADGE[l.stage_source]} {l.stage.replace(/_/g, " ")} · {new Date(l.client_decision_at).toLocaleString()}
                </p>
              )}

              {l.stage === "rejected" && l.rejected_from_stage && (
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Rejected from: {l.rejected_from_stage.replace(/_/g, " ")}</p>
              )}

              {progress && (
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Day {progress.day} of 90{progress.done ? " — guarantee period complete" : ""}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  value={p.stage}
                  onChange={(e) => setPendingFor(l.id, { stage: e.target.value as Stage })}
                  className="text-xs rounded-ros-md border border-slate-200 dark:border-slate-700 px-2 py-1 transition-colors duration-200 ease-ros focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>

                {dirty && (
                  <label className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400">
                    <input
                      type="checkbox"
                      checked={p.clientRelayed}
                      onChange={(e) => setPendingFor(l.id, { clientRelayed: e.target.checked })}
                    />
                    Client told us this
                  </label>
                )}

                {dirty && p.stage === "rejected" && (
                  <input
                    type="text"
                    placeholder="Rejection reason (optional)"
                    value={p.rejectionReason}
                    onChange={(e) => setPendingFor(l.id, { rejectionReason: e.target.value })}
                    className="text-xs rounded-ros-md border border-slate-200 dark:border-slate-700 px-2 py-1 flex-1 min-w-[160px]"
                  />
                )}

                {dirty && p.stage === "placed" && (
                  <input
                    type="date"
                    value={p.dateOfJoining}
                    onChange={(e) => setPendingFor(l.id, { dateOfJoining: e.target.value })}
                    className="text-xs rounded-ros-md border border-slate-200 dark:border-slate-700 px-2 py-1"
                  />
                )}

                {dirty && (
                  <Button onClick={() => saveStage(l)} disabled={saving === l.id} className="!text-xs !py-1 !px-2">
                    {saving === l.id ? "Saving…" : "Save"}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex gap-2">
        <select
          value={selectedMandate}
          onChange={(e) => setSelectedMandate(e.target.value)}
          className="flex-1 rounded-ros-md border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-sm transition-colors duration-200 ease-ros focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <option value="">Link to a mandate...</option>
          {availableMandates.map((m) => (
            <option key={m.id} value={m.id}>
              {m.role_title} — {m.client_name}
            </option>
          ))}
        </select>
        <Button onClick={handleLink} disabled={linking || !selectedMandate}>
          Link
        </Button>
      </div>
    </div>
  );
}
