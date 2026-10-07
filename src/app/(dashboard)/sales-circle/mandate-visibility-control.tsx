"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Publishing a role to referrers opens a review window instead of flipping a
// switch. The admin sets the payout for THIS role, writes (or AI-drafts) the
// summary referrers will read, and only "Publish to referrers" makes it live.
// Both are required: a role never reaches referrers without a payout you chose.
// Taking a role off the board stays one click. The client company name is
// never shown to referrers, so there is nothing to reveal.
export default function MandateVisibilityControl({
  mandateId,
  roleTitle,
  referralVisible,
  referralSummary,
  referralPayout,
  suggestedPayout,
  missingCore = [],
}: {
  mandateId: string;
  roleTitle: string;
  referralVisible: boolean;
  referralSummary: string | null;
  referralPayout: number | null;
  suggestedPayout: number | null;
  // Core details still missing on the role; shown as a warning before it goes live.
  missingCore?: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/sales-circle/mandates/${mandateId}/visibility`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          disabled={busy}
          onClick={() => (referralVisible ? patch({ referralVisible: false }).catch((e) => setError(e.message)) : setReviewOpen(true))}
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${referralVisible ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
          title={referralVisible ? "Click to take this role off the referrer board" : "Click to review and publish this role to referrers"}
        >
          {referralVisible ? "On board" : "Publish…"}
        </button>
        {referralVisible && (
          <button
            disabled={busy}
            onClick={() => setReviewOpen(true)}
            className="text-[11px] font-medium text-slate-400 underline underline-offset-2 hover:text-slate-700"
          >
            Edit listing
          </button>
        )}
        {error && <span className="text-[11px] text-rose-600">{error}</span>}
      </div>
      {reviewOpen && (
        <ReviewModal
          mandateId={mandateId}
          roleTitle={roleTitle}
          live={referralVisible}
          initialSummary={referralSummary ?? ""}
          initialPayout={referralPayout}
          suggestedPayout={suggestedPayout}
          missingCore={missingCore}
          onClose={() => setReviewOpen(false)}
          onConfirm={async (summary, payout) => {
            await patch({ referralVisible: true, referralSummary: summary, referralPayout: payout });
            setReviewOpen(false);
          }}
        />
      )}
    </>
  );
}

function ReviewModal({
  mandateId,
  roleTitle,
  live,
  initialSummary,
  initialPayout,
  suggestedPayout,
  missingCore,
  onClose,
  onConfirm,
}: {
  mandateId: string;
  roleTitle: string;
  live: boolean;
  initialSummary: string;
  initialPayout: number | null;
  suggestedPayout: number | null;
  missingCore: string[];
  onClose: () => void;
  onConfirm: (summary: string, payout: number) => Promise<void>;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [payout, setPayout] = useState(initialPayout != null ? String(initialPayout) : "");
  const [adminNotes, setAdminNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payoutNum = Number(payout.replace(/,/g, ""));
  const payoutOk = payout.trim() !== "" && Number.isFinite(payoutNum) && payoutNum > 0;
  const warnings = missingCore.filter((m) => m !== "Referrer summary" && m !== "Payout");

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/sales-circle/mandates/${mandateId}/generate-referral-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminNotes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI generation failed");
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      await onConfirm(summary, payoutNum);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-[15px] font-semibold text-slate-900">{live ? "Edit listing" : "Review before publishing"}</h3>
          <p className="mt-0.5 text-[12px] text-slate-500">{roleTitle}</p>
        </div>

        <div className="space-y-4 px-5 py-4">
          {warnings.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              Referrers will see &ldquo;To be confirmed&rdquo; for: {warnings.join(", ")}. Fill these in on the mandate first for a clearer listing.
            </p>
          )}

          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Payout for this role (₹) <span className="text-rose-500">*</span>
            </label>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[13px] text-slate-500">₹</span>
              <input
                value={payout}
                onChange={(e) => setPayout(e.target.value.replace(/[^\d,]/g, ""))}
                inputMode="numeric"
                placeholder="e.g. 30000"
                className="w-40 rounded-lg border border-slate-200 px-3 py-2 text-[14px] font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              {suggestedPayout != null && Number(payout.replace(/,/g, "")) !== suggestedPayout && (
                <button type="button" onClick={() => setPayout(String(suggestedPayout))} className="text-[12px] font-medium text-blue-600 hover:underline">
                  Use slab suggestion ₹{suggestedPayout.toLocaleString("en-IN")}
                </button>
              )}
            </div>
            <p className="mt-1 text-[11.5px] text-slate-400">
              What the referrer earns if their candidate is hired. You choose it for each role; referrers see exactly this amount
              {payoutOk ? `: ₹${payoutNum.toLocaleString("en-IN")}` : ""}.
            </p>
          </div>

          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Notes for the AI draft (optional)</label>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={2}
              placeholder="e.g. emphasize hunting over farming, must have handled enterprise deal cycles..."
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
            <button type="button" disabled={generating} onClick={generate} className="mt-2 rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50">
              {generating ? "Drafting..." : summary ? "Regenerate with AI" : "Generate with AI"}
            </button>
          </div>

          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Referrer-facing summary <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={6}
              placeholder="Write or generate a crisp summary for referrers. Don't name the client company."
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
            <p className="mt-1 text-[11.5px] text-slate-400">The company name is never shown to referrers. Saving is blocked if this text mentions it.</p>
          </div>

          {error && <p className="text-[12px] text-rose-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-slate-500 hover:text-slate-800">
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !summary.trim() || !payoutOk}
            onClick={confirm}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : live ? "Save changes" : "Publish to referrers"}
          </button>
        </div>
      </div>
    </div>
  );
}
