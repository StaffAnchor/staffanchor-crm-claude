// Shared by the matchers (server) and the match screens (client).
//
// Three rules live here so every screen agrees:
//  1. A must-have the CV simply doesn't mention is "to confirm", never a no.
//     Only a requirement the candidate's data actively contradicts is a no.
//  2. Every verdict says where it came from: stated in the CV, inferred by
//     the AI, or confirmed by a recruiter on a call.
//  3. A recruiter's confirmation always beats the AI, for that candidate and
//     that mandate.

export type EvidenceBasis = "stated" | "inferred" | "confirmed";

export type Confirmation = {
  candidate_id: string;
  requirement: string;
  status: "met" | "not_met";
  note: string | null;
  confirmed_by_name: string | null;
};

export const confirmationKey = (candidateId: string, requirement: string) => `${candidateId}::${requirement.trim().toLowerCase()}`;

export function confirmationMap(rows: Confirmation[]): Map<string, Confirmation> {
  return new Map(rows.map((r) => [confirmationKey(r.candidate_id, r.requirement), r]));
}

/** Accepts both matchers' vocabularies: met / not_met|missing / unclear|doubt. */
export function summarizeMustHaves(checks: { status: string }[]) {
  const met = checks.filter((c) => c.status === "met").length;
  const notMet = checks.filter((c) => c.status === "not_met" || c.status === "missing").length;
  const toConfirm = checks.length - met - notMet;
  return {
    met,
    notMet,
    toConfirm,
    total: checks.length,
    /** every must-have confirmed */
    meetsAll: notMet === 0 && toConfirm === 0,
    /** nothing contradicts them: worth a call even if some are unconfirmed */
    qualifies: notMet === 0,
  };
}

/** 0 = all confirmed, 1 = nothing contradicted but some to confirm, 2 = at least one contradicted. */
export function matchTier(checks: { status: string }[]): 0 | 1 | 2 {
  const s = summarizeMustHaves(checks);
  return s.notMet > 0 ? 2 : s.toConfirm > 0 ? 1 : 0;
}

/** Reads the model's own "inferred" marker; anything it didn't label stays unlabelled rather than being guessed. */
export function parseBasis(raw: unknown, evidence: string | null | undefined): EvidenceBasis | null {
  if (raw === "stated" || raw === "inferred") return raw;
  if (evidence && /\binferr?ed\b|\bnot explicitly stated\b/i.test(evidence)) return "inferred";
  return null;
}

export const BASIS_LABEL: Record<EvidenceBasis, string> = {
  stated: "Stated in CV",
  inferred: "Inferred, not stated",
  confirmed: "Confirmed by recruiter",
};
