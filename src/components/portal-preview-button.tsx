"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const JOBS_SITE = process.env.NEXT_PUBLIC_JOBS_SITE_URL ?? "https://jobs.staffanchor.com";

// Opens the client portal exactly as this client sees it, read only, without signing in. An admin gets a 30 minute link
// from the database; nothing the admin clicks there is saved.
export default function PortalPreviewButton({ clientId, className = "", label = "Open the client portal" }: { clientId: string; className?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setErr(null);
    // Open the tab straight away (browsers block a window opened after a wait), then point it at the preview.
    const win = window.open("about:blank", "_blank");
    const { data, error } = await createClient().rpc("create_portal_preview", { p_client_id: clientId });
    setBusy(false);
    if (error || !data) {
      win?.close();
      setErr(/admin/i.test(error?.message ?? "") ? "Only an admin can open the portal this way." : "Could not open the preview. Try again.");
      return;
    }
    if (win) win.location.href = `${JOBS_SITE}/client-portal/preview/${data}`;
    else window.location.href = `${JOBS_SITE}/client-portal/preview/${data}`;
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 rounded-ros-md bg-teal-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-teal-700 disabled:opacity-60 ${className}`}
      >
        {busy ? "Opening…" : label} <ExternalLink className="h-3.5 w-3.5" />
      </button>
      {err && <span className="text-[12px] text-rose-600">{err}</span>}
    </span>
  );
}
