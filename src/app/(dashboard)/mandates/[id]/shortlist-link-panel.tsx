"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ShortlistLinkPanel({
  mandateId,
  existingToken,
}: {
  mandateId: string;
  existingToken: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = existingToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/shortlist/${existingToken}`
    : null;

  async function handleGenerate() {
    setCreating(true);
    const token = crypto.randomUUID().replace(/-/g, "");
    await supabase.from("shortlist_tokens").insert({ token, mandate_id: mandateId });
    setCreating(false);
    router.refresh();
  }

  async function handleCopy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900 mb-1">Client shortlist link</h2>
      <p className="text-xs text-slate-500 mb-4">
        A no-login link showing only candidates marked &quot;in client shortlist&quot; for this
        mandate. Notes, red flags, and raw assessment are never included.
      </p>
      {url ? (
        <div className="space-y-2">
          <div className="text-xs font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2 break-all">
            {url}
          </div>
          <button
            onClick={handleCopy}
            className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium py-2"
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      ) : (
        <button
          onClick={handleGenerate}
          disabled={creating}
          className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 disabled:opacity-60"
        >
          {creating ? "Generating..." : "Generate shortlist link"}
        </button>
      )}
    </div>
  );
}
