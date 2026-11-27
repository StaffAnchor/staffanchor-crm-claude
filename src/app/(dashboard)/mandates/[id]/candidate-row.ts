import type { StageSource } from "@/lib/mandate-stage";

// One person on one role, as the pipeline shows them.
export type MandateCandidateRow = {
  id: string;
  stage: string;
  in_shortlist: boolean;
  stage_source: StageSource | null;
  stage_updated_at: string | null;
  client_decision_at: string | null;
  rejected_from_stage: string | null;
  rejection_reason: string | null;
  rejection_category: string | null;
  date_of_joining: string | null;
  call_disposition: string | null;
  call_disposition_note: string | null;
  vendor_update_note: string | null;
  vendor_update_note_at: string | null;
  created_at: string | null;
  // How this person got into the pipeline (applied themselves, added by a recruiter, accepted from an
  // AI suggestion, a vendor, or the older pipeline whose origin was never recorded).
  origin: "applied" | "team" | "ai" | "vendor" | "earlier";
  origin_label: string;
  // Who uploaded the profile, when a recruiter did (bulk upload).
  uploader_name?: string;
  screened: boolean;
  // Set when the candidate paid ₹199 on jobs.staffanchor.com for a recruiter call on this
  // application; the call is promised by call_due_at.
  call_paid_at: string | null;
  call_due_at: string | null;
  // Snapshotted from the Matching Workspace at the moment this candidate was
  // added to the pipeline via "Add to pipeline" (see matches-workspace.tsx
  // addToPipeline) -- null for candidates added any other way (manual add,
  // quick-apply, LinkedIn sourcing promotion). Lets a recruiter see at a
  // glance how strong a fit the system originally thought this candidate
  // was, without leaving the Table/Board for the matching workspace.
  match_score: number | null;
  match_bucket: "perfect" | "close" | "stretch" | null;
  // Mandate-specific AI read -- see buildMatchAssessment in
  // candidate-match.ts. Lives on the LINK (not the candidate) precisely
  // because the whole point is that it changes per mandate: the same
  // candidate can be a Strong Fit for one role and Not a Fit for another,
  // and a field left blank (e.g. CTC not disclosed) should read as
  // "missing", never as a red flag.
  match_assessment: {
    recommendation: "Strong Fit" | "Fit with Reservations" | "Not a Fit" | "Needs a call";
    positives: string[];
    red_flags: string[];
    missing: string[];
  } | null;
  // Null = nobody on the team has opened this candidate's profile or resume
  // for THIS mandate yet -- shown as an unread/"New" marker. Set once, by
  // whoever opens it first, and never cleared -- a shared team inbox (two
  // recruiters working the same mandate both see the same read state), not
  // a per-user read receipt.
  viewed_at: string | null;
  // The recruiter's saved answer on each must-have, and the CV check if the role has one.
  share_review?: { requirements?: { kind?: string; requirement: string; status: "met" | "partial" | "not_met"; note?: string }[] } | null;
  cv_checks?: { requirement: string; status: "met" | "doubt" | "missing"; evidence?: string | null }[] | null;
  // Set by the client themselves via the no-login shortlist link (see
  // submit_client_shortlist_feedback RPC / shortlist/[token]/feedback-buttons.tsx)
  // -- "interested" and "not_interested" never touch stage, so without this
  // surfaced somewhere a recruiter had no way to see those two responses at
  // all short of re-opening the client's own link. "interview_requested"
  // also moves stage to client_interview, so this badge is somewhat
  // redundant with the stage badge for that one value, but showing it here
  // too keeps all three responses visually consistent instead of two being
  // invisible and one being a totally different UI element.
  client_feedback: "interested" | "not_interested" | "interview_requested" | null;
  // Why the client passed, as they chose it in the portal (and any note they added).
  client_pass_reason: string | null;
  client_pass_note: string | null;
  // A note from us that the client sees on this candidate's card in the portal.
  client_note: string | null;
  // Ways this not-yet-shared candidate resembles people the client has passed on, worded for the recruiter.
  pass_patterns: string[];
  // The last two jobs, newest first, shown beside the stage so screening needs no extra clicks.
  last_roles: { title: string; company: string | null; period: string }[];
  // Degrees from the CV, newest first as the CV lists them (empty until the CV has been read).
  education: { degree: string | null; institution: string | null; year: string | null }[];
  candidate: {
    id: string;
    full_name: string;
    email: string | null;
    phone?: string | null;
    expected_fixed_ctc?: number | null;
    source_channel?: string | null;
    acquisition_source?: string | null;
    readiness_missing?: string[] | null;
    category: string | null;
    sub_domain: string | null;
    total_experience_years: number | null;
    current_fixed_ctc: number | null;
    recruiter_assessment: Record<string, unknown> | null;
    work_mode: string | null;
    open_to_relocation: string | null;
    notice_period: string | null;
    segment_data: Record<string, unknown> | null;
    current_employer: string | null;
    current_location?: string | null;
    current_job_title?: string | null;
    career_timeline_resume: unknown;
    career_timeline_profile: unknown;
    owner_id: string | null;
    resume_file_url?: string | null;
    // Auto-computed from the resume's career timeline (see
    // computeStabilityScore) -- same field/scale as the main Candidates
    // table's Stability Score column, surfaced here too since a recruiter
    // deciding who to submit for THIS mandate shouldn't have to leave the
    // pipeline to go check it on the profile page.
    stability_score: number | null;
    // Sales-specific quick facts (quota attainment, buyer personas sold to,
    // disqualifiers) -- tiny by design, cheap to render inline.
    talent_micro_index: {
      normalized_acv_band?: string;
      buyer_personas_sold_to?: string[];
      verified_quota_attainment_pct?: number;
      disqualifiers?: string[];
    } | null;
    // Overall, candidate-level read -- generated once automatically when the
    // candidate registers (see generateAiPassportForCandidate), NOT
    // mandate-specific. Shown alongside the mandate-specific "AI Read"
    // column so a recruiter can see "who is this person overall" next to
    // "how do they fit THIS role" without leaving the pipeline.
    ai_summary: string | null;
    // How this candidate entered the system + who added them, if
    // recruiter-driven -- see candidate-source-label.ts for the full
    // mapping. created_by_user is set once at insert and never touched
    // by owner reassignment, so it's the true "who uploaded this CV".
    created_by: string | null;
    created_by_user: string | null;
    source: string | null;
  };
};
