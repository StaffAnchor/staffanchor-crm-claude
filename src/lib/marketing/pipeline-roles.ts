import type { SupabaseClient } from "@supabase/supabase-js";
import { generateTextWithFallback } from "@/lib/ai-providers";
import { logAiUsage } from "@/lib/ai-usage";

// "Pipeline roles" are public listings for the kinds of roles StaffAnchor
// genuinely places, published with no client named and clearly labelled as
// pipeline hiring. They bring in traffic and real candidates; they are never
// presented as a live vacancy. Nothing here invents a company, a pay figure or
// a hiring claim.

export const PIPELINE_CLIENT_NAME = "StaffAnchor Talent Pipeline";
export const PIPELINE_PUBLIC_LABEL = "Pipeline role · companies hiring in this space";
const JOBS_SITE = process.env.NEXT_PUBLIC_JOBS_SITE_URL ?? "https://jobs.staffanchor.com";

const METROS = ["Bengaluru", "Mumbai", "Delhi NCR", "Hyderabad", "Pune", "Chennai"];
const SUB_DOMAINS = ["SaaS Sales", "Inside Sales (B2B)", "Enterprise Sales (Non-SaaS)"];

export type DraftRole = {
  role_title: string;
  city: string;
  sub_domain: string;
  experience_min: number;
  experience_max: number;
  work_mode: string | null;
  overview: string;
  responsibilities: string[];
  candidate_profile: string[];
  must_haves: string[];
  good_to_haves: string[];
  linkedin_post: string;
};

export function shortLink(code: string): string {
  return `${JOBS_SITE}/j/${code}?utm_source=linkedin&utm_medium=social&utm_campaign=pipeline`;
}

function parseJsonArray(raw: string): unknown[] | null {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

const strList = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, max) : [];

function clean(raw: unknown): DraftRole | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const role_title = String(o.role_title ?? "").trim();
  const city = METROS.find((m) => m.toLowerCase() === String(o.city ?? "").trim().toLowerCase());
  const sub = SUB_DOMAINS.find((s) => s.toLowerCase() === String(o.sub_domain ?? "").trim().toLowerCase()) ?? "SaaS Sales";
  const overview = String(o.overview ?? "").trim();
  const must = strList(o.must_haves, 5);
  const good = strList(o.good_to_haves, 4);
  let post = String(o.linkedin_post ?? "").trim();
  if (!role_title || !city || !overview || must.length === 0 || good.length === 0 || !post) return null;
  if (!post.includes("{{LINK}}")) post = `${post}\n\nApply here: {{LINK}}`;
  const min = Math.max(0, Math.min(30, Math.round(Number(o.experience_min) || 0)));
  const max = Math.max(min, Math.min(40, Math.round(Number(o.experience_max) || min + 3)));
  return {
    role_title: role_title.slice(0, 120),
    city,
    sub_domain: sub,
    experience_min: min,
    experience_max: max,
    work_mode: ["Hybrid", "On-site", "Remote"].find((w) => w.toLowerCase() === String(o.work_mode ?? "").toLowerCase()) ?? null,
    overview: overview.slice(0, 700),
    responsibilities: strList(o.responsibilities, 6),
    candidate_profile: strList(o.candidate_profile, 5),
    must_haves: must,
    good_to_haves: good,
    linkedin_post: post.slice(0, 1200),
  };
}

export async function draftPipelineRoles(count: number, existing: string[]): Promise<DraftRole[]> {
  const prompt = `You write public job listings and LinkedIn posts for StaffAnchor, a sales recruitment firm in India.

Write ${count} PIPELINE roles. A pipeline role is a role of a kind StaffAnchor regularly places candidates into. It is NOT a specific live vacancy at a named company. Focus on B2B SaaS sales, AI / data / developer-tool sales and technology sales.

Rules:
- Never name a company or client, and never invent funding, headcount, salary or "urgent opening" claims.
- Do not state any salary or pay figure.
- Spread the roles across these cities only: ${METROS.join(", ")}. Mix seniority from 2 to 12 years.
- Each role must be distinct from these existing ones: ${existing.length ? existing.join("; ") : "(none yet)"}.
- sub_domain must be one of: ${SUB_DOMAINS.join(" | ")}.
- work_mode must be one of: Hybrid | On-site | Remote.
- overview: 2 to 3 plain sentences saying what the role does and that StaffAnchor is building a shortlist for companies hiring in this space.
- responsibilities, candidate_profile: short bullet strings.
- must_haves: 3 to 4 requirements. good_to_haves: 2 to 3.
- linkedin_post: under 600 characters, plain and human, no emoji spam, at most 3 hashtags. Say it is a pipeline role StaffAnchor is shortlisting for. It must contain the exact text {{LINK}} where the apply link goes.

Return ONLY a JSON array, no markdown fence, no commentary:
[{"role_title":"","city":"","sub_domain":"","experience_min":0,"experience_max":0,"work_mode":"","overview":"","responsibilities":[""],"candidate_profile":[""],"must_haves":[""],"good_to_haves":[""],"linkedin_post":""}]`;

  let result;
  try {
    result = await generateTextWithFallback(prompt);
  } catch (err) {
    await logAiUsage({ purpose: "marketing_pipeline_roles", error: err instanceof Error ? err.message : String(err), prompt });
    throw err;
  }
  await logAiUsage({ purpose: "marketing_pipeline_roles", result, prompt });
  const arr = parseJsonArray(result.text);
  if (!arr) throw new Error("The AI answer could not be read. Please try again.");
  const seen = new Set(existing.map((e) => e.toLowerCase()));
  const roles: DraftRole[] = [];
  for (const item of arr) {
    const r = clean(item);
    if (!r) continue;
    const key = `${r.role_title} · ${r.city}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    roles.push(r);
  }
  return roles.slice(0, count);
}

/** Publishes the drafted roles as open pipeline mandates and stores each post. */
export async function publishPipelineRoles(admin: SupabaseClient, roles: DraftRole[], ownerId: string | null) {
  const batchId = crypto.randomUUID();
  const out: { id: string; role_title: string; city: string; short_code: string | null }[] = [];
  for (const r of roles) {
    const { data: m, error } = await admin
      .from("mandates")
      .insert({
        client_name: PIPELINE_CLIENT_NAME,
        public_client_label: PIPELINE_PUBLIC_LABEL,
        show_client_name: false,
        role_title: r.role_title,
        category: "b2b_sales",
        sub_domain: r.sub_domain,
        sub_domains: [r.sub_domain],
        city: r.city,
        cities: [r.city],
        experience_min: r.experience_min,
        experience_max: r.experience_max,
        work_mode: r.work_mode,
        jd_overview: r.overview,
        jd_responsibilities: r.responsibilities.join("\n"),
        jd_candidate_profile: r.candidate_profile.join("\n"),
        job_description: [r.overview, ...r.responsibilities.map((x) => `• ${x}`)].join("\n"),
        must_haves: r.must_haves,
        good_to_haves: r.good_to_haves,
        notes: "Pipeline role created from the Marketing page.",
        listing_kind: "pipeline",
        status: "open",
        owner_id: ownerId,
      })
      .select("id, role_title, city, short_code")
      .single();
    if (error || !m) throw new Error(error?.message ?? "Could not publish a role.");
    const code = (m as { short_code: string | null }).short_code;
    const body = r.linkedin_post.replace("{{LINK}}", code ? shortLink(code) : `${JOBS_SITE}/jobs`);
    await admin.from("marketing_posts").insert({ mandate_id: (m as { id: string }).id, platform: "linkedin", body, batch_id: batchId });
    out.push({ id: (m as { id: string }).id, role_title: r.role_title, city: r.city, short_code: code });
  }
  return { batchId, roles: out };
}
