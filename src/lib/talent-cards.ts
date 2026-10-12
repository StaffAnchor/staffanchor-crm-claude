import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { TalentCardData } from "@/app/(dashboard)/candidates/board/talent-card";

// Turns candidate rows into the cards shown on the Talent board and in saved shortlists, so both look
// and read the same: CV highlight, rating, and a short-lived CV link for the preview.

export const CARD_COLUMNS =
  "id, candidate_number, full_name, email, phone, current_job_title, current_employer, employer_canonical, city_canonical, current_location, total_experience_years, current_fixed_ctc, expected_fixed_ctc, notice_period, notice_days_est, profile_group, profile_subgroup, profile_group_needs_review, readiness_score, readiness_tier, readiness_missing, industries, resume_file_url, created_at";

type Facts = {
  roles?: { is_current?: boolean; company?: string | null; title?: string | null; sells?: string | null; customer_type?: string | null; deal_size?: string | null; achievement?: string | null }[];
  tools?: string[];
  sales?: { hunter_or_farmer?: string | null };
};

function fromFacts(f: Facts | null | undefined): { highlight: string | null; chips: string[] } {
  if (!f) return { highlight: null, chips: [] };
  const cur = (f.roles ?? []).find((r) => r.is_current) ?? (f.roles ?? [])[0];
  const parts: string[] = [];
  if (cur?.sells) {
    const ct = (cur.customer_type ?? "").toUpperCase();
    parts.push(`Sells ${cur.sells}${cur.customer_type ? ` to ${ct === "B2B" ? "businesses" : ct === "B2C" ? "consumers" : cur.customer_type}` : ""}`);
  }
  if (cur?.deal_size) parts.push(`deal size ${cur.deal_size}`);
  let highlight = parts.length ? `${parts.join(", ")}.` : null;
  if (cur?.achievement) highlight = `${highlight ? `${highlight} ` : ""}${cur.achievement}`.slice(0, 180);
  const chips: string[] = [];
  const hf = f.sales?.hunter_or_farmer;
  if (hf && /hunt|farm|both/i.test(hf)) chips.push(/both/i.test(hf) ? "Hunter + farmer" : /hunt/i.test(hf) ? "Hunter" : "Farmer");
  for (const t of (f.tools ?? []).slice(0, 2)) chips.push(t);
  return { highlight, chips };
}

export async function buildTalentCards(supabase: SupabaseClient, rows: Record<string, unknown>[]): Promise<TalentCardData[]> {
  const ids = rows.map((r) => r.id as string);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin = key ? createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key) : null;
  const [factsRes, ratingsRes, fitRes] = await Promise.all([
    ids.length ? supabase.from("candidate_cv_facts").select("candidate_id, facts").in("candidate_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("candidate_profile_ratings").select("candidate_id, rating").in("candidate_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("candidate_role_fit").select("candidate_id, suggested_count, strong_count, top_roles").in("candidate_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const fitBy = new Map(
    ((fitRes.data ?? []) as { candidate_id: string; suggested_count: number; strong_count: number; top_roles: { mandate_id: string; title: string; fit: string; score: number }[] | null }[]).map((r) => [r.candidate_id, r])
  );
  const factsBy = new Map<string, Facts>(((factsRes.data ?? []) as { candidate_id: string; facts: Facts }[]).map((r) => [r.candidate_id, r.facts]));
  const ratingBy = new Map<string, "strong" | "weak">(((ratingsRes.data ?? []) as { candidate_id: string; rating: "strong" | "weak" }[]).map((r) => [r.candidate_id, r.rating]));
  const paths = rows.map((r) => r.resume_file_url as string | null).filter((v): v is string => !!v);
  const signedBy = new Map<string, string>();
  if (admin && paths.length) {
    const { data: signed } = await admin.storage.from("resumes").createSignedUrls(paths, 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) signedBy.set(s.path, s.signedUrl);
  }
  return rows.map((r) => {
    const id = r.id as string;
    const f = fromFacts(factsBy.get(id));
    const title = (r.current_job_title as string | null) ?? null;
    const company = (r.employer_canonical as string | null) ?? (r.current_employer as string | null) ?? null;
    return {
      id,
      candidate_number: (r.candidate_number as number | null) ?? null,
      full_name: (r.full_name as string) || "Unnamed",
      headline: [title, company].filter(Boolean).join(" at "),
      city: (r.city_canonical as string | null) ?? (r.current_location as string | null) ?? null,
      experience: (r.total_experience_years as number | null) ?? null,
      current_ctc: (r.current_fixed_ctc as number | null) ?? null,
      expected_ctc: (r.expected_fixed_ctc as number | null) ?? null,
      notice: (r.notice_period as string | null) ?? null,
      group: (r.profile_group as string | null) ?? null,
      subgroup: (r.profile_subgroup as string | null) ?? null,
      needs_review: !!r.profile_group_needs_review,
      readiness_score: (r.readiness_score as number | null) ?? null,
      readiness_tier: (r.readiness_tier as string | null) ?? null,
      readiness_missing: (r.readiness_missing as string[] | null) ?? [],
      industries: (r.industries as string[] | null) ?? [],
      highlight: f.highlight,
      chips: f.chips,
      rating: ratingBy.get(id) ?? null,
      role_fit: fitBy.get(id)
        ? { count: fitBy.get(id)!.suggested_count, strong: fitBy.get(id)!.strong_count, roles: (fitBy.get(id)!.top_roles ?? []).map((r) => ({ mandateId: r.mandate_id, title: r.title.trim(), fit: r.fit, score: r.score })) }
        : null,
      has_email: !/\.invalid$/i.test((r.email as string) ?? ""),
      phone: (r.phone as string | null) ?? null,
      resume_file_url: (r.resume_file_url as string | null) ?? null,
      resume_signed_url: r.resume_file_url ? signedBy.get(r.resume_file_url as string) ?? null : null,
    };
  });
}
