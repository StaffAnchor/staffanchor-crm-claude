"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, Building2, Link2, CalendarClock, X, AlertTriangle, Sparkles } from "lucide-react";
import QuickOutreachModal from "./quick-outreach-modal";
import {
  STAGES,
  STAGE_LABEL,
  SOURCES,
  SOURCE_LABEL,
  formatDealValue,
  priorityTone,
  priorityLabel,
  type SalesLeadScoredRow,
} from "./sales-constants";

const SOURCE_TONE: Record<string, "neutral" | "accent" | "success" | "warning" | "info"> = {
  manual: "neutral",
  linkedin: "info",
  apollo: "accent",
  lusha: "success",
  zoominfo: "warning",
  referral: "neutral",
  inbound: "neutral",
  website: "accent",
};

// Loose company-name matching for duplicate detection -- strips common
// legal suffixes ("Pvt Ltd", "Inc", "Technologies", ...) and punctuation so
// "Acme Pvt. Ltd." and "Acme Technologies" both normalize to "acme" and are
// flagged as the same prospect, instead of only catching exact string matches.
const COMPANY_SUFFIX_WORDS = [
  "private", "pvt", "limited", "ltd", "llp", "llc", "inc", "incorporated",
  "corp", "corporation", "co", "company", "technologies", "technology",
  "tech", "solutions", "solution", "systems", "system", "services",
  "service", "india", "group", "holdings",
];
function normalizeCompanyName(name: string) {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !COMPANY_SUFFIX_WORDS.includes(w));
  return words.join(" ").trim();
}
function normalizeDomain(domain: string) {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

type DuplicateMatch = { kind: "lead" | "client"; id: string; label: string; detail: string };

function isOverdue(dateStr: string | null) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date(new Date().toDateString());
}

async function moveStage(supabase: ReturnType<typeof createClient>, lead: SalesLeadScoredRow, newStage: string) {
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

function LeadCard({ lead }: { lead: SalesLeadScoredRow }) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-ros-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-ros-sm hover:shadow-ros-md hover:-translate-y-px transition-all duration-200 ease-ros">
      <Link href={`/sales/${lead.id}`} className="block group">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 transition-colors duration-200 ease-ros truncate flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            {lead.company_name}
          </p>
          {/* Priority score from sales_leads_scored -- the "which lead should I
              call first" signal. Recomputed fresh on every read, see the
              sales_ae_assist_briefing_and_scoring migration. */}
          <Badge tone={priorityTone(lead.priority_score)} size="sm" className="shrink-0 normal-case tracking-normal">
            {priorityLabel(lead.priority_score)} · {lead.priority_score}
          </Badge>
        </div>
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

function AddLeadModal({ onClose, existingLeads }: { onClose: () => void; existingLeads: SalesLeadScoredRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
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

  // Debounced duplicate check as the recruiter types the company name/domain
  // -- catches both "we're already talking to them" (another sales_leads row)
  // and "they're already a client" (a converted, closed-won relationship),
  // so the same prospect doesn't get chased twice under slightly different
  // spellings. Warns only; never blocks Save, since a repeat opportunity with
  // a past client is often legitimate.
  useEffect(() => {
    const name = form.company_name.trim();
    const domain = form.company_domain.trim();
    if (name.length < 3 && !domain) {
      setDuplicates([]);
      return;
    }
    const normalizedName = normalizeCompanyName(name);
    const normalizedDomain = domain ? normalizeDomain(domain) : null;

    const timer = setTimeout(async () => {
      setCheckingDuplicates(true);
      const matches: DuplicateMatch[] = [];

      existingLeads.forEach((lead) => {
        const leadDomain = lead.company_domain ? normalizeDomain(lead.company_domain) : null;
        const nameMatch = normalizedName.length >= 3 && normalizeCompanyName(lead.company_name) === normalizedName;
        const domainMatch = normalizedDomain && leadDomain && leadDomain === normalizedDomain;
        if (nameMatch || domainMatch) {
          matches.push({ kind: "lead", id: lead.id, label: lead.company_name, detail: `Already a Sales lead (${lead.stage.replace("_", " ")})` });
        }
      });

      if (normalizedName.length >= 3) {
        const { data: clientMatches } = await supabase
          .from("clients")
          .select("id, name")
          .ilike("name", `%${name.slice(0, 40)}%`)
          .limit(5);
        (clientMatches ?? []).forEach((c: { id: string; name: string }) => {
          if (normalizeCompanyName(c.name) === normalizedName) {
            matches.push({ kind: "client", id: c.id, label: c.name, detail: "Already an active StaffAnchor client" });
          }
        });
      }

      setDuplicates(matches);
      setCheckingDuplicates(false);
    }, 400);

    return () => clearTimeout(timer);
  }, [form.company_name, form.company_domain, existingLeads, supabase]);

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
            <label className={labelClass}>
              Company name *
              {checkingDuplicates && <span className="ml-1.5 normal-case font-normal text-slate-400">checking for duplicates...</span>}
            </label>
            <input className={inputClass} value={form.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="Acme Corp" />
          </div>

          {duplicates.length > 0 && (
            <div className="rounded-ros-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Possible duplicate{duplicates.length > 1 ? "s" : ""} found
              </p>
              <ul className="mt-1.5 space-y-1">
                {duplicates.map((d) => (
                  <li key={`${d.kind}-${d.id}`} className="text-[11.5px] text-amber-700 dark:text-amber-400">
                    <Link
                      href={d.kind === "lead" ? `/sales/${d.id}` : `/clients/${d.id}`}
                      target="_blank"
                      className="underline hover:text-amber-900 dark:hover:text-amber-200"
                    >
                      {d.label}
                    </Link>
                    {" — "}
                    {d.detail}
                  </li>
                ))}
              </ul>
              <p className="text-[10.5px] text-amber-600 dark:text-amber-500 mt-1.5">
                You can still add this lead — a repeat opportunity with a past client is often legitimate.
              </p>
            </div>
          )}

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

export default function SalesBoard({ leads, ownerNames }: { leads: SalesLeadScoredRow[]; ownerNames: Record<string, string> }) {
  const [showAdd, setShowAdd] = useState(false);
  const [showOutreach, setShowOutreach] = useState(false);
  const [sortByPriority, setSortByPriority] = useState(false);
  void ownerNames; // reserved for a future "assigned to" filter

  // URL-based, like Candidates/Mandates -- so the search survives clicking
  // into a lead and back, instead of silently resetting (gap #8, July 2026
  // audit: Sales was the one list page whose filter state didn't round-trip).
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";
  // "all" or one of SOURCES' keys -- lets a recruiter isolate e.g. just
  // "Website" leads (the Employer Inquiries -> Sales Lead conversion path)
  // to see how that channel is actually converting, same URL-synced
  // pattern as the search box so it survives navigating into a lead.
  const sourceFilter = searchParams.get("source") ?? "all";

  function setQuery(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("q", next);
    else params.delete("q");
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
  }

  function setSourceFilter(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next && next !== "all") params.set("source", next);
    else params.delete("source");
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
  }

  const filteredLeads = leads
    .filter((l) => sourceFilter === "all" || l.source === sourceFilter)
    .filter((l) => {
      if (!q.trim()) return true;
      const needle = q.trim().toLowerCase();
      return (
        l.company_name?.toLowerCase().includes(needle) ||
        l.contact_name?.toLowerCase().includes(needle) ||
        l.company_domain?.toLowerCase().includes(needle)
      );
    });

  const byStage: Record<string, SalesLeadScoredRow[]> = {};
  STAGES.forEach((s) => (byStage[s.key] = []));
  filteredLeads.forEach((l) => {
    (byStage[l.stage] ??= []).push(l);
  });
  if (sortByPriority) {
    Object.values(byStage).forEach((list) => list.sort((a, b) => b.priority_score - a.priority_score));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3">
        <input
          value={q}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search company or contact..."
          className="text-[12.5px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 w-64 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="text-[12.5px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="all">All sources</option>
          {SOURCES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <p className="text-[11.5px] text-slate-400 flex-1">Click a card for full details, notes, and activity history.</p>
        <Button
          variant={sortByPriority ? "primary" : "secondary"}
          size="sm"
          onClick={() => setSortByPriority((v) => !v)}
        >
          {sortByPriority ? "Sorted: priority" : "Sort by priority"}
        </Button>
        <Button variant="secondary" icon={<Sparkles className="w-3.5 h-3.5" />} onClick={() => setShowOutreach(true)}>
          Generate outreach
        </Button>
        <Button icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setShowAdd(true)}>
          Add lead
        </Button>
      </div>

      {filteredLeads.length === 0 ? (
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

      {showAdd && <AddLeadModal onClose={() => setShowAdd(false)} existingLeads={leads} />}
      {showOutreach && <QuickOutreachModal onClose={() => setShowOutreach(false)} />}
    </div>
  );
}
