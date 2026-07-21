"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, Building2, Link2, CalendarClock, X } from "lucide-react";
import {
  STAGES,
  STAGE_LABEL,
  SOURCES,
  SOURCE_LABEL,
  formatDealValue,
  type SalesLeadRow,
} from "./sales-constants";

const SOURCE_TONE: Record<string, "neutral" | "accent" | "success" | "warning" | "info"> = {
  manual: "neutral",
  linkedin: "info",
  apollo: "accent",
  lusha: "success",
  zoominfo: "warning",
  referral: "neutral",
  inbound: "neutral",
};

function isOverdue(dateStr: string | null) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date(new Date().toDateString());
}

async function moveStage(supabase: ReturnType<typeof createClient>, lead: SalesLeadRow, newStage: string) {
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("sales_leads")
    .update({ stage: newStage, stage_updated_at: nowIso, updated_at: nowIso })
    .eq("id", lead.id);
  if (error) {
    window.alert(`Couldn't move lead: ${error.message}`);
    return false;
  }
  await supabase.from("sales_lead_activities").insert({
    lead_id: lead.id,
    activity_type: "stage_change",
    detail: `${STAGE_LABEL[lead.stage] ?? lead.stage} → ${STAGE_LABEL[newStage] ?? newStage}`,
  });
  return true;
}

function LeadCard({ lead }: { lead: SalesLeadRow }) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-ros-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-ros-sm hover:shadow-ros-md hover:-translate-y-px transition-all duration-200 ease-ros">
      <Link href={`/sales/${lead.id}`} className="block group">
        <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 transition-colors duration-200 ease-ros truncate flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          {lead.company_name}
        </p>
        {(lead.contact_name || lead.contact_title) && (
          <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            {lead.contact_name}
            {lead.contact_name && lead.contact_title ? " · " : ""}
            {lead.contact_title}
          </p>
        )}
      </Link>

      <div className="flex items-center gap-1.5 flex-wrap mt-2">
        <Badge tone={SOURCE_TONE[lead.source] ?? "neutral"} size="sm" className="normal-case tracking-normal">
          {SOURCE_LABEL[lead.source] ?? lead.source}
        </Badge>
        {lead.deal_value != null && (
          <Badge tone="success" size="sm" className="normal-case tracking-normal">
            {formatDealValue(lead.deal_value, lead.deal_value_currency)}
          </Badge>
        )}
        {lead.linkedin_url && (
          <a href={lead.linkedin_url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-blue-600 transition-colors duration-200 ease-ros">
            <Link2 className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {lead.next_follow_up_date && (
        <p className={`flex items-center gap-1 text-[11px] mt-2 ${isOverdue(lead.next_follow_up_date) ? "text-rose-500 font-medium" : "text-slate-400"}`}>
          <CalendarClock className="w-3 h-3" />
          Follow up {new Date(lead.next_follow_up_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
        </p>
      )}

      <select
        value={lead.stage}
        disabled={busy}
        onChange={async (e) => {
          setBusy(true);
          const ok = await moveStage(supabase, lead, e.target.value);
          setBusy(false);
          if (ok) router.refresh();
        }}
        className="mt-2.5 w-full text-[11.5px] rounded-ros-md border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 px-2 py-1.5 text-slate-600 dark:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-shadow duration-200 ease-ros disabled:opacity-50"
      >
        {STAGES.map((s) => (
          <option key={s.key} value={s.key}>
            Move to: {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function AddLeadModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    company_name: "",
    company_domain: "",
    company_industry: "",
    company_size: "",
    contact_name: "",
    contact_title: "",
    contact_email: "",
    contact_phone: "",
    linkedin_url: "",
    source: "manual",
    deal_value: "",
    deal_value_currency: "INR",
    next_follow_up_date: "",
    notes: "",
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!form.company_name.trim()) {
      window.alert("Company name is required.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("sales_leads").insert({
      company_name: form.company_name.trim(),
      company_domain: form.company_domain.trim() || null,
      company_industry: form.company_industry.trim() || null,
      company_size: form.company_size.trim() || null,
      contact_name: form.contact_name.trim() || null,
      contact_title: form.contact_title.trim() || null,
      contact_email: form.contact_email.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      linkedin_url: form.linkedin_url.trim() || null,
      source: form.source,
      deal_value: form.deal_value ? Number(form.deal_value) : null,
      deal_value_currency: form.deal_value_currency,
      next_follow_up_date: form.next_follow_up_date || null,
      notes: form.notes.trim() || null,
    });
    setSaving(false);
    if (error) {
      window.alert(`Couldn't save lead: ${error.message}`);
      return;
    }
    onClose();
    router.refresh();
  }

  const inputClass =
    "w-full text-[13px] rounded-ros-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-shadow duration-200 ease-ros";
  const labelClass = "text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-ros-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-ros-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Add lead</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors duration-200 ease-ros">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className={labelClass}>Company name *</label>
            <input className={inputClass} value={form.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="Acme Corp" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Domain</label>
              <input className={inputClass} value={form.company_domain} onChange={(e) => set("company_domain", e.target.value)} placeholder="acme.com" />
            </div>
            <div>
              <label className={labelClass}>Industry</label>
              <input className={inputClass} value={form.company_industry} onChange={(e) => set("company_industry", e.target.value)} placeholder="SaaS, BFSI, ..." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Contact name</label>
              <input className={inputClass} value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} placeholder="Jane Doe" />
            </div>
            <div>
              <label className={labelClass}>Title</label>
              <input className={inputClass} value={form.contact_title} onChange={(e) => set("contact_title", e.target.value)} placeholder="VP Sales" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Email</label>
              <input className={inputClass} value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} placeholder="jane@acme.com" />
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              <input className={inputClass} value={form.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} placeholder="+91 ..." />
            </div>
          </div>
          <div>
            <label className={labelClass}>LinkedIn URL</label>
            <input className={inputClass} value={form.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
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
            <div>
              <label className={labelClass}>Next follow-up</label>
              <input type="date" className={inputClass} value={form.next_follow_up_date} onChange={(e) => set("next_follow_up_date", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Potential deal value</label>
              <input type="number" className={inputClass} value={form.deal_value} onChange={(e) => set("deal_value", e.target.value)} placeholder="e.g. 300000" />
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
            <label className={labelClass}>Notes</label>
            <textarea className={inputClass} rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Context, how you found them, what they need..." />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Add lead"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SalesBoard({ leads, ownerNames }: { leads: SalesLeadRow[]; ownerNames: Record<string, string> }) {
  const [showAdd, setShowAdd] = useState(false);
  void ownerNames; // reserved for a future "assigned to" filter

  const byStage: Record<string, SalesLeadRow[]> = {};
  STAGES.forEach((s) => (byStage[s.key] = []));
  leads.forEach((l) => {
    (byStage[l.stage] ??= []).push(l);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11.5px] text-slate-400">Click a card for full details, notes, and activity history.</p>
        <Button icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setShowAdd(true)}>
          Add lead
        </Button>
      </div>

      {leads.length === 0 ? (
        <EmptyState
          title="No leads yet"
          description="Add your first prospect — from LinkedIn, Apollo, Lusha, ZoomInfo, or a referral."
        />
      ) : (
        <div className="grid grid-cols-6 gap-3 items-start overflow-x-auto">
          {STAGES.map((s) => {
            const stageLeads = byStage[s.key] ?? [];
            const stageValue = stageLeads.reduce((sum, l) => sum + (l.deal_value ?? 0), 0);
            return (
              <div key={s.key} className="min-w-[200px]">
                <div className="flex items-center justify-between mb-2 px-1">
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{s.label}</p>
                  <span className="text-[11px] font-semibold text-slate-400 tabular-nums">{stageLeads.length}</span>
                </div>
                {stageValue > 0 && (
                  <p className="text-[10.5px] text-slate-400 px-1 mb-2 -mt-1">{formatDealValue(stageValue, "INR")}</p>
                )}
                <div className="space-y-2">
                  {stageLeads.map((lead) => (
                    <LeadCard key={lead.id} lead={lead} />
                  ))}
                  {stageLeads.length === 0 && <p className="text-[11px] text-slate-300 dark:text-slate-700 px-1">—</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && <AddLeadModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}
