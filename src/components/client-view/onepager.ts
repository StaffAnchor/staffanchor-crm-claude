// The one-page summary StaffAnchor writes for a candidate on a client's shortlist. The staff view does not load it, so this is only
// the shape the shared drawer expects.
export type OnePager = {
  brief: {
    headline: string;
    summary: string;
    selling: string[];
    strengths: string[];
    probe: string[];
    logistics: { notice: string | null; pay: string | null; relocation: string | null; city: string | null };
    recruiter_take: string | null;
    signals: string[];
  };
  approved_at: string;
};
