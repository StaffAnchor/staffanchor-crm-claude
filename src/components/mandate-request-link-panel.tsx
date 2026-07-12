"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Link2, Copy, Check } from "lucide-react";

// A shareable, no-login link a recruiter sends a client so the CLIENT fills
// in the hiring brief themselves -- the ideal path described by the user
// ("get mandate details from client, second best is recruiter fills it").
// Submissions land in employer_inquiries just like every other public
// intake path; a recruiter still explicitly reviews and clicks "Create
// Mandate" before anything is live. Reusable/evergreen, not single-use.
export default function MandateRequestLinkPanel({
  clientNamePrefill,
  roleTitlePrefill,
}: {
  clientNamePrefill?: string;
  roleTitlePrefill?: string;
}) {
  const supabase = createClient();
  const [creating, setCreating] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function handleGenerate() {
    setCreating(true);
    setError("");
    const token = crypto.randomUUID().replace(/-/g, "");
    const { error: err } = await supabase.from("mandate_request_tokens").insert({
      token,
      client_name_prefill: clientNamePrefill || null,
      role_title_prefill: roleTitlePrefill || null,
    });
    setCreating(false);
    if (err) {
      setError(err.message);
      return;
    }
    setUrl(`https://staffanchor.com/mandate-request/${token}`);
  }

  async function handleCopy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-1.5">
        <Link2 className="w-3.5 h-3.5 text-slate-400" /> Share a hiring-brief link
      </h2>
      <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-3">
        Send this to the client so they can fill in role details themselves -- lands here in Employer Inquiries for
        you to review, same as any other submission. Nothing goes live without you clicking &quot;Create Mandate&quot;.
      </p>
      {url ? (
        <div className="space-y-2">
          <div className="text-[11px] font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-2 break-all">
            {url}
          </div>
          <button
            onClick={handleCopy}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[13px] font-medium py-2"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      ) : (
        <button
          onClick={handleGenerate}
          disabled={creating}
          className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium py-2 disabled:opacity-60"
        >
          {creating ? "Generating..." : "Generate link"}
        </button>
      )}
      {error && <p className="text-[11px] text-red-600 mt-2">{error}</p>}
    </div>
  );
}
