// Calling from the CRM: the phone's own dialer makes the call, the CRM remembers it was started, and when the recruiter
// comes back a short sheet asks how it went. These helpers are shared by every Call button.

export const dialNumber = (phone: string | null | undefined): string | null => {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length === 10) return `+91${d}`;
  if (d.length === 12 && d.startsWith("91")) return `+${d}`;
  return d.length >= 8 ? `+${d}` : null;
};

/** Records the call as started, then hands over to the phone's dialer. Never blocks the call if recording fails. */
export async function startCall(opts: { candidateId: string; mandateId?: string | null; phone: string | null | undefined }) {
  const number = dialNumber(opts.phone);
  if (!number) {
    // Not a number we can tidy up: still let the phone try it.
    if (opts.phone) window.location.href = `tel:${opts.phone}`;
    return false;
  }
  try {
    await fetch("/api/calls/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId: opts.candidateId, mandateId: opts.mandateId ?? null }), keepalive: true });
    window.dispatchEvent(new Event("sa-call-started"));
  } catch {
    // The call still goes ahead; the sheet just won't be waiting afterwards.
  }
  window.location.href = `tel:${number}`;
  return true;
}

export type PendingCall = { id: string; startedAt: string; candidateId: string; candidateName: string | null; mandateId: string | null; role: string | null };
