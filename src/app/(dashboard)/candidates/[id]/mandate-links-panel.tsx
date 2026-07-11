"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const STAGES = [
  "sourced",
  "screened",
  "shortlisted",
  "submitted",
  "client_interview",
  "offer",
  "placed",
  "rejected",
];

type Link = {
  id: string;
  mandate_id: string;
  stage: string;
  in_shortlist: boolean;
  rejection_reason: string | null;
  mandates: { client_name: string; role_title: string } | null;
};

type Mandate = { id: string; client_name: string; role_title: string };

export default function MandateLinksPanel({
  candidateId,
  links,
  openMandates,
}: {
  candidateId: string;
  links: Link[];
  openMandates: Mandate[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [selectedMandate, setSelectedMandate] = useState("");
  const [linking, setLinking] = useState(false);

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

  async function updateStage(linkId: string, stage: string) {
    await supabase
      .from("candidate_mandate_links")
      .update({ stage, stage_updated_at: new Date().toISOString() })
      .eq("id", linkId);
    router.refresh();
  }

  async function toggleShortlist(linkId: string, current: boolean) {
    await supabase
      .from("candidate_mandate_links")
      .update({ in_shortlist: !current })
      .eq("id", linkId);
    router.refresh();
  }

  return (
    <div>
      <div className="space-y-3 mb-4">
        {links.length === 0 && <p className="text-sm text-slate-400">Not linked to any mandate yet.</p>}
        {links.map((l) => (
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
            <div className="mt-2">
              <select
                value={l.stage}
                onChange={(e) => updateStage(l.id, e.target.value)}
                className="text-xs rounded-ros-md border border-slate-200 dark:border-slate-700 px-2 py-1 transition-colors duration-200 ease-ros focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          </Card>
        ))}
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
