"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Turning a mandate visible to referrers now opens a review modal instead
// of flipping the flag immediately -- the admin sees (and can AI-draft,
// then edit) the exact crisp write-up referrers will read, and only the
// "Confirm & make visible" action inside the modal actually flips
// referral_visible, saving referral_summary in the same request. Turning a
// mandate OFF, and toggling the separate "reveal company to Trusted"
// switch, stay one-click since there's nothing to review there.
export default function MandateVisibilityControl({
  mandateId,
  roleTitle,
  referralVisible,
  revealCompany,
  referralSummary,
}: {
  mandateId: string;
  roleTitle: string;
  referralVisible: boolean;
  revealCompany: boolean;
  referralSummary: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/sales-circle/mandates/${mandateId}/visibility`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
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
          onClick={() => (referralVisible ? patch({ referralVisible: false }) : setReviewOpen(true))}
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            referralVisible ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {referralVisible ? "On board" : "Hidden"}
        </button>
        {referralVisible && (
          <button
            disabled={busy}
            onClick={() => patch({ revealCompany: !revealCompany })}
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              revealCompany ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {revealCompany ? "Reveals to Trusted" : "Company hidden"}
          </button>
        )}
        {referralVisible && (
          <button
            disabled={busy}
            onClick={() => setReviewOpen(true)}
            className="text-[11px] font-medium text-slate-400 hover:text-slate-700 underline underline-offset-2"
          >
            Edit summary
          </button>
        )}
      </div>
      {reviewOpen && (
        <ReviewModal
          mandateId={mandateId}
          roleTitle={roleTitle}
          initialSummary={referralSummary ?? ""}
          onClose={() => setReviewOpen(false)}
          onConfirm={async (summary) => {
            await patch({ referralVisible: true, referralSummary: summary });
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
  initialSummary,
  onClose,
  onConfirm,
}: {
  mandateId: string;
  roleTitle: string;
  initialSummary: string;
  onClose: () => void;
  onConfirm: (summary: string) => Promise<void>;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [adminNotes, setAdminNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await onConfirm(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-[15px] font-semibold text-slate-900">Review before making visible</h3>
          <p className="text-[12px] text-slate-500 mt-0.5">{roleTitle}</p>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-[12px] text-slate-500">
            This is the write-up referrers will see on the roles board. Type notes below and generate an AI draft, or
            write/edit it directly -- nothing goes live until you confirm.
          </p>

          <div>
            <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
              Notes for the AI draft (optional)
            </label>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={2}
              placeholder="e.g. emphasize hunting over farming, must have handled enterprise deal cycles..."
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
            <button
              type="button"
              disabled={generating}
              onClick={generate}
              className="mt-2 rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
            >
              {generating ? "Drafting..." : summary ? "Regenerate with AI" : "Generate with AI"}
            </button>
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
              Referrer-facing summary
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={6}
              placeholder="Write or generate a crisp summary for referrers..."
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>

          {error && <p className="text-[12px] text-rose-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-slate-500 hover:text-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !summary.trim()}
            onClick={confirm}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Confirm & make visible"}
          </button>
        </div>
      </div>
    </div>
  );
}
