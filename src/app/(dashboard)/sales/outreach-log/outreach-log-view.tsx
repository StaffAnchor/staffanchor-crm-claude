"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, Link2, ArrowRightCircle, Trash2, X, Inbox } from "lucide-react";
import {
  OUTREACH_STATUSES,
  OUTREACH_STATUS_LABEL,
  OUTREACH_STATUS_TONE,
  isFollowUpDue,
  type OutreachLogRow,
} from "../outreach-log-constants";

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function LogOutreachModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    company_name: "",
    contact_name: "",
    contact_title: "",
    role_hint: "",
    channel: "linkedin" as "linkedin" | "email",
    follow_up_date: addDays(3),
    message_snippet: "",
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("outreach_log").insert({
      company_name: form.company_name.trim(),
      contact_name: form.contact_name.trim() || null,
      contact_title: form.contact_title.trim() || null,
      role_hint: form.role_hint.trim() || null,
      channel: form.channel,
      follow_up_date: form.follow_up_date || null,
      message_snippet: form.message_snippet.trim() || null,
      notes: form.notes.trim() || null,
      owner_id: user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      window.alert(`Couldn't log this outreach: ${error.message}`);
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
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Log outreach</h2>
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
              <label className={labelClass}>Contact name</label>
              <input className={inputClass} value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} placeholder="Jane Doe" />
            </div>
            <div>
              <label className={labelClass}>Contact title</label>
              <input className={inputClass} value={form.contact_title} onChange={(e) => set("contact_title", e.target.value)} placeholder="VP Sales" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Role they're hiring for (optional)</label>
            <input className={inputClass} value={form.role_hint} onChange={(e) => set("role_hint", e.target.value)} placeholder="e.g. Inside Sales Specialist" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Channel</label>
              <select className={inputClass} value={form.channel} onChange={(e) => set("channel", e.target.value as "linkedin" | "email")}>
                <option value="linkedin">LinkedIn</option>
                <option value="email">Email</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Follow up on</label>
              <input type="date" className={inputClass} value={form.follow_up_date} onChange={(e) => set("follow_up_date", e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Message sent (optional)</label>
            <textarea className={inputClass} rows={3} value={form.message_snippet} onChange={(e) => set("message_snippet", e.target.value)} placeholder="Paste what you sent, for your own record" />
          </div>
          <div>
            <label className={labelClass}>Notes (optional)</label>
            <input className={inputClass} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything worth remembering" />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Log outreach"}
          </Button>
        </div>
      </div>
    </div>
  );
}

type Filter = "all" | "due" | "sent" | "no_response" | "replied" | "interested" | "not_interested";

export default function OutreachLogView({ initialRows, ownerNames }: { initialRows: OutreachLogRow[]; ownerNames: Record<string, string> }) {
  const router = useRouter();
  const supabase = createClient();
  const [rows, setRows] = useState(initialRows);
  const [filter, setFilter] = useState<Filter>("all");
  const [showLog, setShowLog] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const dueCount = useMemo(() => rows.filter(isFollowUpDue).length, [rows]);

  const filteredRows = rows.filter((r) => {
    if (filter === "all") return true;
    if (filter === "due") return isFollowUpDue(r);
    return r.status === filter;
  });

  async function updateStatus(id: string, status: string) {
    setBusyId(id);
    const { error } = await supabase.from("outreach_log").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    setBusyId(null);
    if (error) {
      window.alert(`Couldn't update status: ${error.message}`);
      return;
    }
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  async function updateFollowUp(id: string, date: string) {
    setBusyId(id);
    const { error } = await supabase.from("outreach_log").update({ follow_up_date: date || null, updated_at: new Date().toISOString() }).eq("id", id);
    setBusyId(null);
    if (error) {
      window.alert(`Couldn't update follow-up date: ${error.message}`);
      return;
    }
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, follow_up_date: date || null } : r)));
  }

  async function convertToLead(row: OutreachLogRow) {
    setBusyId(row.id);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: lead, error: leadError } = await supabase
      .from("sales_leads")
      .insert({
        company_name: row.company_name,
        company_domain: row.company_domain,
        contact_name: row.contact_name,
        contact_title: row.contact_title,
        source: row.channel === "linkedin" ? "linkedin" : "manual",
        notes: [row.role_hint ? `Role: ${row.role_hint}` : null, row.notes].filter(Boolean).join("\n") || null,
        owner_id: row.owner_id,
      })
      .select("id")
      .single();
    if (leadError || !lead) {
      setBusyId(null);
      window.alert(`Couldn't convert to a lead: ${leadError?.message ?? "unknown error"}`);
      return;
    }
    await supabase.from("outreach_log").update({ converted_lead_id: lead.id, status: "interested" }).eq("id", row.id);
    setBusyId(null);
    router.push(`/sales/${lead.id}`);
  }

  async function deleteRow(id: string) {
    if (!window.confirm("Delete this outreach record? This can't be undone.")) return;
    setBusyId(id);
    const { error } = await supabase.from("outreach_log").delete().eq("id", id);
    setBusyId(null);
    if (error) {
      window.alert(`Couldn't delete: ${error.message}`);
      return;
    }
    setRows((cur) => cur.filter((r) => r.id !== id));
  }

  const filterTabs: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "due", label: `Needs follow-up${dueCount ? ` (${dueCount})` : ""}` },
    ...OUTREACH_STATUSES.map((s) => ({ key: s.key as Filter, label: s.label })),
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {filterTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`text-[11.5px] px-2.5 py-1.5 rounded-ros-md ring-1 transition-colors duration-200 ease-ros ${
                filter === t.key
                  ? "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-800"
                  : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 ring-slate-200 dark:ring-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Button icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setShowLog(true)}>
          Log outreach
        </Button>
      </div>

      {filteredRows.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<Inbox className="w-6 h-6 text-slate-400" />}
            title="Nothing here yet"
            description="Log a LinkedIn or email message you've sent so a follow-up date doesn't get lost."
          />
        </Card>
      ) : (
        <Card padded={false} className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-left text-slate-400">
                <th className="px-3 py-2 font-medium">Company</th>
                <th className="px-3 py-2 font-medium">Contact</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Sent</th>
                <th className="px-3 py-2 font-medium">Follow up</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Owner</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => {
                const due = isFollowUpDue(r);
                return (
                  <tr key={r.id} className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                    <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                      <div className="flex items-center gap-1.5">
                        {r.company_name}
                        <Badge tone={r.channel === "linkedin" ? "info" : "neutral"} size="sm" className="normal-case tracking-normal">
                          {r.channel === "linkedin" ? "LinkedIn" : "Email"}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                      {r.contact_name || "—"}
                      {r.contact_title ? <span className="text-slate-400"> · {r.contact_title}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{r.role_hint || "—"}</td>
                    <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                      {new Date(r.sent_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        value={r.follow_up_date ?? ""}
                        onChange={(e) => updateFollowUp(r.id, e.target.value)}
                        disabled={busyId === r.id}
                        className={`text-[11.5px] rounded-ros-md border px-2 py-1 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                          due ? "border-rose-300 text-rose-600 dark:border-rose-800 dark:text-rose-400" : "border-slate-200 dark:border-slate-700"
                        }`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={r.status}
                        onChange={(e) => updateStatus(r.id, e.target.value)}
                        disabled={busyId === r.id}
                        className="text-[11.5px] rounded-ros-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      >
                        {OUTREACH_STATUSES.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <Badge tone={OUTREACH_STATUS_TONE[r.status] ?? "neutral"} size="sm" className="ml-1.5 normal-case tracking-normal hidden lg:inline-flex">
                        {OUTREACH_STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{r.owner_id ? ownerNames[r.owner_id] ?? "—" : "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 justify-end">
                        {r.converted_lead_id ? (
                          <a href={`/sales/${r.converted_lead_id}`} className="text-blue-500 hover:text-blue-700 transition-colors duration-200 ease-ros" title="View sales lead">
                            <Link2 className="w-3.5 h-3.5" />
                          </a>
                        ) : (
                          <button
                            onClick={() => convertToLead(r)}
                            disabled={busyId === r.id}
                            className="text-slate-400 hover:text-emerald-600 transition-colors duration-200 ease-ros disabled:opacity-50"
                            title="Convert to Sales lead"
                          >
                            <ArrowRightCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteRow(r.id)}
                          disabled={busyId === r.id}
                          className="text-slate-300 hover:text-rose-500 transition-colors duration-200 ease-ros disabled:opacity-50"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {showLog && <LogOutreachModal onClose={() => setShowLog(false)} />}
    </div>
  );
}
