"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDateTimeIST } from "@/lib/format-datetime";

export default function ShortlistLinkPanel({
  mandateId,
  existingToken,
  firstOpenedAt,
  lastOpenedAt,
  openCount,
}: {
  mandateId: string;
  existingToken: string | null;
  firstOpenedAt?: string | null;
  lastOpenedAt?: string | null;
  openCount?: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Hardcoded to the branded client-facing subdomain rather than
  // window.location.origin -- so the link shown/copied here is always the
  // short clients.staffanchor.com URL, regardless of which host the
  // recruiter is viewing the CRM from.
  const url = existingToken ? `https://clients.staffanchor.com/shortlist/${existingToken}` : null;

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
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Client shortlist link</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        Shows only candidates marked &quot;in client shortlist&quot; for this mandate. Notes, red
        flags, and raw assessment are never included. Opening it requires a one-time email code,
        sent only to email addresses registered as a contact for this client (Manage {"->"} Client
        page).
      </p>
      {url ? (
        <div className="space-y-2">
          <div className="text-xs font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-2 break-all">
            {url}
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            {firstOpenedAt ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-slate-500 dark:text-slate-400">
                  Client opened {formatDateTimeIST(firstOpenedAt)}
                  {openCount && openCount > 1 && lastOpenedAt ? (
                    <>
                      {" · "}
                      {openCount} view{openCount === 1 ? "" : "s"}, last {formatDateTimeIST(lastOpenedAt)}
                    </>
                  ) : null}
                </span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                <span className="text-slate-400">Not yet opened by client</span>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium py-2"
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
            {/* Staff (admin/recruiter/partner) signed into the CRM skip the
                client email-OTP gate automatically (see is-staff-viewer.ts) --
                this just gives a one-click way to sanity-check the link
                without retyping it into a new tab by hand. */}
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex-1 flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-sm font-medium py-2"
            >
              Open in new tab ↗
            </a>
          </div>
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
