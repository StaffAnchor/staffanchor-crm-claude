"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Copy, Check, Loader2, X } from "lucide-react";

// Standalone outreach generator, separate from the per-lead draft panel on
// /sales/[id] -- this one doesn't need the company to exist in the CRM yet.
// The intended flow: founder finds a B2B/Enterprise SaaS company on
// LinkedIn, plugs in the company + contact here, gets a personalized
// first-person draft, sends it, and only adds it as a Sales lead afterward
// if there's real interest (via the existing "Add lead" action).
export default function QuickOutreachModal({ onClose }: { onClose: () => void }) {
  const [channel, setChannel] = useState<"linkedin" | "email">("linkedin");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [roleHint, setRoleHint] = useState("");
  const [companyIndustry, setCompanyIndustry] = useState("");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    if (!companyName.trim()) {
      setError("Company name is required.");
      return;
    }
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/sales-leads/draft-outreach-adhoc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          company_name: companyName,
          contact_name: contactName,
          contact_title: contactTitle,
          role_hint: roleHint,
          company_industry: companyIndustry,
          notes,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? "Couldn't generate a draft.");
        return;
      }
      setDraft(body.draft ?? "");
    } catch {
      setError("Couldn't reach the AI drafting service.");
    } finally {
      setLoading(false);
    }
  }

  async function copyDraft() {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const inputClass =
    "w-full text-[13px] rounded-ros-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-shadow duration-200 ease-ros";
  const labelClass = "text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 block";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-ros-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-ros-md p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-blue-500" />
            Generate outreach
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors duration-200 ease-ros">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[11.5px] text-slate-400 mb-4">
          Founder-led message, written in the first person around your 16 years leading B2B/Enterprise SaaS sales &amp; revenue teams. For a company you've found on LinkedIn — not saved as a lead yet.
        </p>

        <div className="space-y-3">
          <div>
            <label className={labelClass}>Company name *</label>
            <input className={inputClass} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Corp" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Contact name</label>
              <input className={inputClass} value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div>
              <label className={labelClass}>Contact title</label>
              <input className={inputClass} value={contactTitle} onChange={(e) => setContactTitle(e.target.value)} placeholder="VP Sales / Head of RevOps" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Role they're hiring for (optional)</label>
            <input className={inputClass} value={roleHint} onChange={(e) => setRoleHint(e.target.value)} placeholder="e.g. Inside Sales Specialist" />
          </div>
          <div>
            <label className={labelClass}>Company industry (optional)</label>
            <input className={inputClass} value={companyIndustry} onChange={(e) => setCompanyIndustry(e.target.value)} placeholder="e.g. B2B SaaS, fintech, martech" />
          </div>
          <div>
            <label className={labelClass}>Anything you noticed about them (optional)</label>
            <textarea
              className={inputClass}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. just raised a round, posted about scaling the sales team, recently opened AE roles..."
            />
          </div>

          <div className="flex items-center gap-2">
            {(["linkedin", "email"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setChannel(c)}
                className={`text-[11.5px] px-2.5 py-1.5 rounded-ros-md ring-1 transition-colors duration-200 ease-ros ${
                  channel === c
                    ? "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-800"
                    : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 ring-slate-200 dark:ring-slate-700"
                }`}
              >
                {c === "linkedin" ? "LinkedIn DM" : "Cold email"}
              </button>
            ))}
            <Button variant="secondary" size="sm" onClick={generate} disabled={loading} className="ml-auto">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Generate draft"}
            </Button>
          </div>

          {error && <p className="text-[12px] text-rose-500">{error}</p>}

          {draft && (
            <div className="relative">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={8}
                className="w-full text-[12.5px] rounded-ros-md border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-shadow duration-200 ease-ros"
              />
              <button
                onClick={copyDraft}
                className="absolute top-2 right-2 text-slate-400 hover:text-blue-600 transition-colors duration-200 ease-ros"
                title="Copy to clipboard"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
