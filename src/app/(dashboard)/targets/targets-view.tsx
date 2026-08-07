"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";

export type TargetAccountRow = {
  id: string;
  company_name: string;
  industry: string | null;
  account_type: string | null;
  city: string | null;
  priority: string;
  status: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  owner_id: string | null;
  owner_name: string | null;
  converted_client_id: string | null;
  created_at: string;
};

const STATUS_OPTIONS = ["identified", "contacted", "meeting_booked", "proposal_sent", "converted_client", "lost"];
const STATUS_LABEL: Record<string, string> = {
  identified: "Identified",
  contacted: "Contacted",
  meeting_booked: "Meeting booked",
  proposal_sent: "Proposal sent",
  converted_client: "Converted",
  lost: "Lost",
};
const STATUS_TONE: Record<string, BadgeTone> = {
  identified: "neutral",
  contacted: "info",
  meeting_booked: "info",
  proposal_sent: "warning",
  converted_client: "success",
  lost: "danger",
};
const PRIORITY_TONE: Record<string, BadgeTone> = { high: "danger", medium: "warning", low: "neutral" };

export default function TargetsView({
  initialRows,
  fetchError,
  staffOptions,
}: {
  initialRows: TargetAccountRow[];
  fetchError: string | null;
  staffOptions: { id: string; label: string }[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [accountType, setAccountType] = useState("gcc");
  const [city, setCity] = useState("");
  const [priority, setPriority] = useState("medium");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(
    () => (statusFilter === "all" ? initialRows : initialRows.filter((r) => r.status === statusFilter)),
    [initialRows, statusFilter]
  );

  async function handleAdd() {
    if (!companyName.trim()) return;
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("target_accounts").insert({
      company_name: companyName.trim(),
      industry: industry.trim() || null,
      account_type: accountType,
      city: city.trim() || null,
      priority,
      owner_id: user?.id ?? null,
    });
    setSaving(false);
    setCompanyName("");
    setIndustry("");
    setCity("");
    setShowAdd(false);
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors ${
              statusFilter === "all" ? "bg-teal-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
            }`}
          >
            All
          </button>
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors ${
                statusFilter === s ? "bg-teal-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
              }`}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowAdd((s) => !s)}
          className="flex items-center gap-1 text-[13px] font-medium text-white bg-teal-600 hover:bg-teal-500 rounded-lg px-3 py-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Add target
        </button>
      </div>

      {showAdd && (
        <div className="mb-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Company name *"
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 text-[13px] col-span-2"
          />
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="Industry"
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 text-[13px]"
          />
          <select
            value={accountType}
            onChange={(e) => setAccountType(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 text-[13px]"
          >
            <option value="gcc">GCC</option>
            <option value="enterprise">Enterprise</option>
            <option value="saas">SaaS</option>
            <option value="bfsi">BFSI</option>
            <option value="other">Other</option>
          </select>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City"
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 text-[13px]"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2.5 py-1.5 text-[13px]"
          >
            <option value="high">High priority</option>
            <option value="medium">Medium priority</option>
            <option value="low">Low priority</option>
          </select>
          <button
            onClick={handleAdd}
            disabled={saving || !companyName.trim()}
            className="rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-[13px] font-medium py-1.5"
          >
            {saving ? "Adding..." : "Add"}
          </button>
        </div>
      )}

      {fetchError ? (
        <p className="text-sm text-red-600">{fetchError}</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-400 py-8 text-center">No target accounts here.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => (
            <TargetRow key={row.id} row={row} staffOptions={staffOptions} />
          ))}
        </div>
      )}
    </div>
  );
}

function TargetRow({ row, staffOptions }: { row: TargetAccountRow; staffOptions: { id: string; label: string }[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);

  async function setStatus(status: string) {
    setSaving(true);
    await supabase.from("target_accounts").update({ status, last_activity_at: new Date().toISOString() }).eq("id", row.id);
    setSaving(false);
    router.refresh();
  }

  async function convertToClient() {
    if (row.converted_client_id) return;
    setConverting(true);
    const { data: newClient, error } = await supabase
      .from("clients")
      .insert({ name: row.company_name, industry: row.industry, owner_id: row.owner_id })
      .select("id")
      .single();
    if (!error && newClient) {
      await supabase
        .from("target_accounts")
        .update({ status: "converted_client", converted_client_id: newClient.id, last_activity_at: new Date().toISOString() })
        .eq("id", row.id);
    }
    setConverting(false);
    router.refresh();
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-900 dark:text-slate-100">{row.company_name}</span>
            <Badge tone={STATUS_TONE[row.status] ?? "neutral"} size="sm">
              {STATUS_LABEL[row.status] ?? row.status}
            </Badge>
            <Badge tone={PRIORITY_TONE[row.priority] ?? "neutral"} size="sm">
              {row.priority}
            </Badge>
          </div>
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
            {[row.account_type?.toUpperCase(), row.industry, row.city].filter(Boolean).join(" · ") || "—"}
            {row.owner_name ? ` · owned by ${row.owner_name}` : ""}
          </p>
          {(row.contact_name || row.contact_email) && (
            <p className="text-[11px] text-slate-400 mt-0.5">
              {[row.contact_name, row.contact_email, row.contact_phone].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {row.converted_client_id ? (
            <a href={`/clients/${row.converted_client_id}`} className="text-[12px] text-blue-600 hover:underline">
              View client →
            </a>
          ) : (
            <>
              <select
                value={row.status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={saving}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1 text-[12px]"
              >
                {STATUS_OPTIONS.filter((s) => s !== "converted_client").map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              <button
                onClick={convertToClient}
                disabled={converting}
                className="text-[12px] font-medium text-emerald-700 dark:text-emerald-400 hover:underline disabled:opacity-40"
              >
                {converting ? "Converting..." : "Convert to client"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
