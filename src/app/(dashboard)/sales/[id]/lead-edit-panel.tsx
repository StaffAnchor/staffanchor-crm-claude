"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { STAGES, STAGE_LABEL, SOURCES, type SalesLeadRow } from "../sales-constants";

export default function LeadEditPanel({ lead }: { lead: SalesLeadRow }) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    stage: lead.stage,
    source: lead.source,
    company_industry: lead.company_industry ?? "",
    company_size: lead.company_size ?? "",
    deal_value: lead.deal_value != null ? String(lead.deal_value) : "",
    deal_value_currency: lead.deal_value_currency ?? "INR",
    next_follow_up_date: lead.next_follow_up_date ?? "",
    lost_reason: lead.lost_reason ?? "",
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    const nowIso = new Date().toISOString();
    const stageChanged = form.stage !== lead.stage;
    const { error } = await supabase
      .from("sales_leads")
      .update({
        stage: form.stage,
        source: form.source,
        company_industry: form.company_industry.trim() || null,
        company_size: form.company_size.trim() || null,
        deal_value: form.deal_value ? Number(form.deal_value) : null,
        deal_value_currency: form.deal_value_currency,
        next_follow_up_date: form.next_follow_up_date || null,
        lost_reason: form.lost_reason.trim() || null,
        updated_at: nowIso,
        ...(stageChanged ? { stage_updated_at: nowIso } : {}),
      })
      .eq("id", lead.id);
    if (stageChanged && !error) {
      await supabase.from("sales_lead_activities").insert({
        lead_id: lead.id,
        activity_type: "stage_change",
        detail: `${STAGE_LABEL[lead.stage] ?? lead.stage} → ${STAGE_LABEL[form.stage] ?? form.stage}`,
      });
    }
    setSaving(false);
    if (error) {
      window.alert(`Couldn't save: ${error.message}`);
      return;
    }
    router.refresh();
  }

  const inputClass =
    "w-full text-[13px] rounded-ros-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-shadow duration-200 ease-ros";
  const labelClass = "text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block";

  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Deal details</h2>
      <div className="space-y-3">
        <div>
          <label className={labelClass}>Stage</label>
          <select className={inputClass} value={form.stage} onChange={(e) => set("stage", e.target.value)}>
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        {form.stage === "lost" && (
          <div>
            <label className={labelClass}>Lost reason</label>
            <input className={inputClass} value={form.lost_reason} onChange={(e) => set("lost_reason", e.target.value)} placeholder="Budget, timing, went with another vendor..." />
          </div>
        )}
        <div>
          <label className={labelClass}>Source</label>
          <select className={inputClass} value={form.source} onChange={(e) => set("source", e.target.value)}>
            {SOURCES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Industry</label>
            <input className={inputClass} value={form.company_industry} onChange={(e) => set("company_industry", e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Company size</label>
            <input className={inputClass} value={form.company_size} onChange={(e) => set("company_size", e.target.value)} placeholder="e.g. 200-500" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Potential deal value</label>
            <input type="number" className={inputClass} value={form.deal_value} onChange={(e) => set("deal_value", e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Currency</label>
            <select className={inputClass} value={form.deal_value_currency} onChange={(e) => set("deal_value_currency", e.target.value)}>
              <option value="INR">INR</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>
        <div>
          <label className={labelClass}>Next follow-up</label>
          <input type="date" className={inputClass} value={form.next_follow_up_date} onChange={(e) => set("next_follow_up_date", e.target.value)} />
        </div>
        <Button variant="primary" className="w-full" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </Card>
  );
}
