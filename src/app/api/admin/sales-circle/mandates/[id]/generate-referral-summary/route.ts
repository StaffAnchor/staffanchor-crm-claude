import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateTextWithFallback } from "@/lib/ai-providers";

// Drafts the referrer-facing "crisp write-up" for a mandate: a short,
// jargon-free summary a non-recruiter referrer can read in 10 seconds to
// decide who in their network fits. Seeded from the mandate's existing JD
// fields (written for candidates/clients, often long) plus optional
// free-form notes the admin types in the review modal -- reuses the shared
// generateTextWithFallback (Gemini->Groq->Mistral) chain rather than
// calling any provider directly, per the app-wide AI-generation pattern.
// The admin reviews/edits the draft before it's ever saved or shown to
// referrers (see visibility route) -- this endpoint only returns text.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { data: mandate, error: mandateError } = await supabase
    .from("mandates")
    .select(
      "role_title, category, sub_domain, city, budget_min, budget_max, team_size_band, company_size_band, must_haves, good_to_haves, job_description, jd_overview, jd_responsibilities, jd_candidate_profile"
    )
    .eq("id", id)
    .single();
  if (mandateError || !mandate) return NextResponse.json({ error: "Mandate not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const adminNotes: string = typeof body.adminNotes === "string" ? body.adminNotes.trim() : "";

  const budgetLine =
    mandate.budget_min != null && mandate.budget_max != null
      ? `₹${(mandate.budget_min / 100000).toFixed(1)}L - ₹${(mandate.budget_max / 100000).toFixed(1)}L`
      : "not specified";

  const jdParts = [mandate.jd_overview, mandate.jd_responsibilities, mandate.jd_candidate_profile, mandate.job_description]
    .filter(Boolean)
    .join("\n\n");

  const prompt = `You are writing a short role summary for a non-recruiter referral partner in a sales staffing agency's referrer network. They will read this to decide who in their personal network might fit -- they are not a recruiter and don't know jargon.

Role: ${mandate.role_title}
Category: ${mandate.category ?? "—"}${mandate.sub_domain ? ` (${mandate.sub_domain})` : ""}
City: ${mandate.city ?? "Location flexible"}
CTC band: ${budgetLine}
Team size: ${mandate.team_size_band ?? "—"}
Company size: ${mandate.company_size_band ?? "—"}
Must-have requirements: ${(mandate.must_haves ?? []).join(", ") || "—"}
Good-to-have: ${(mandate.good_to_haves ?? []).join(", ") || "—"}

Internal job description (for your context only -- do not copy verbatim, do not reveal the client's name):
${jdParts || "(no JD text on file)"}
${adminNotes ? `\nAdditional notes from the admin to emphasize in the write-up:\n${adminNotes}` : ""}

Write a crisp 3-5 sentence summary a referrer can skim in 10 seconds. Plain language, no recruiter jargon, no client/company name (referrers only see the company name if the mandate is separately marked as revealed). Cover: what the role actually does day-to-day, the kind of person who'd be a strong fit (background/experience type), and anything that would immediately disqualify someone. Do not use markdown formatting, headers, or bullet points -- plain prose only.`;

  try {
    const result = await generateTextWithFallback(prompt);
    return NextResponse.json({ summary: result.text.trim(), provider: result.provider });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "AI generation failed" }, { status: 500 });
  }
}
