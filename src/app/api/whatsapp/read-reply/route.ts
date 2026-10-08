import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { generateTextWithFallback } from "@/lib/ai-providers";
import { missingKeyDetails } from "@/lib/key-details";
import { parseCtcLakhs, parseExperienceYears, parseLocation, parseNoticePeriod } from "@/lib/whatsapp-bot/parse";

export const runtime = "nodejs";
export const maxDuration = 60;

const LABEL: Record<string, string> = {
  current_fixed_ctc: "Current CTC",
  expected_fixed_ctc: "Expected CTC",
  notice_period: "Notice period",
  total_experience_years: "Experience",
  current_location: "City",
  current_employer: "Current company",
  current_job_title: "Current role",
};
const SHOW = (key: string, v: string | number) => (key.endsWith("ctc") ? `${v} lakh` : key === "total_experience_years" ? `${v} years` : String(v));

// Turns a free-text reply ("12 LPA, 16 LPA, 30 days") into profile fields.
//  - without `apply`: reads the reply and returns what it found, for the recruiter to check;
//  - with `apply`: saves those values into the profile's blank fields. Nothing is saved without that second step.
// The AI only picks out which words answer which question; every value is then read by the same
// strict parsers the WhatsApp assistant uses, so a misread never lands on a profile.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { candidateId, messageId, apply } = (await req.json().catch(() => ({}))) as { candidateId?: string; messageId?: string; apply?: Record<string, string> };
  if (!candidateId) return NextResponse.json({ error: "candidateId is required" }, { status: 400 });

  const { data: cand } = await supabase
    .from("candidates")
    .select("id, email, current_job_title, current_employer, total_experience_years, current_fixed_ctc, expected_fixed_ctc, notice_period, current_location, resume_file_url")
    .eq("id", candidateId)
    .maybeSingle();
  if (!cand) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  const wanted = missingKeyDetails(cand).map((m) => m.key).filter((k) => k !== "resume_file_url");
  if (wanted.length === 0) return NextResponse.json({ ok: false, error: "Nothing is missing that a reply could fill in." });

  // Read raw answers (a string per field) either from the reply (preview) or from the confirmed preview (apply).
  let raw: Record<string, string> = {};
  if (apply) {
    raw = apply;
  } else {
    if (!messageId) return NextResponse.json({ error: "messageId is required" }, { status: 400 });
    const { data: msg } = await supabase.from("whatsapp_messages").select("body_preview, direction").eq("id", messageId).maybeSingle();
    const reply = (msg?.body_preview as string | null)?.trim();
    if (!msg || msg.direction !== "inbound" || !reply) return NextResponse.json({ ok: false, error: "That message has no text to read." });
    const questions = wanted.map((k, i) => `${i + 1}. ${k} (${LABEL[k]})`).join("\n");
    const prompt = `A recruiter asked a candidate for these details:\n${questions}\n\nThe candidate replied:\n"""${reply.slice(0, 1500)}"""\n\nReturn ONLY a JSON object whose keys are among the field names above. For each field the candidate clearly answered, give the candidate's own words for it as a short string (for example "12 LPA" or "30 days"). If they answered in order without labels, match answers to the questions in order. Leave out anything not clearly answered. Never guess or calculate.`;
    try {
      const { text } = await generateTextWithFallback(prompt, { json: true, thinkingBudget: 256 });
      const parsed = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()) as Record<string, unknown>;
      for (const k of wanted) if (typeof parsed[k] === "string" || typeof parsed[k] === "number") raw[k] = String(parsed[k]).trim();
    } catch {
      return NextResponse.json({ ok: false, error: "Couldn't read that reply automatically. Please enter the details by hand." });
    }
  }

  // Every value goes through the strict readers. Only fields still blank on the profile are accepted.
  const clean: Record<string, number | string> = {};
  for (const k of wanted) {
    const v = raw[k];
    if (!v) continue;
    let out: number | string | null = null;
    if (k === "current_fixed_ctc") out = parseCtcLakhs(v, { allowZero: true });
    else if (k === "expected_fixed_ctc") out = parseCtcLakhs(v);
    else if (k === "notice_period") out = parseNoticePeriod(v);
    else if (k === "total_experience_years") out = parseExperienceYears(v);
    else if (k === "current_location") out = parseLocation(v);
    else if (k === "current_employer" || k === "current_job_title") out = v.length >= 2 && v.length <= 80 && !v.includes("?") ? v : null;
    if (out !== null && out !== undefined) clean[k] = out;
  }

  if (!apply) {
    const found = Object.entries(clean).map(([key, value]) => ({ key, label: LABEL[key], value, display: SHOW(key, value), raw: raw[key] }));
    if (found.length === 0) return NextResponse.json({ ok: false, error: "Couldn't find any of the missing details in that reply." });
    return NextResponse.json({ ok: true, found });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || Object.keys(clean).length === 0) return NextResponse.json({ ok: false, error: "Nothing to save." });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);
  const { error } = await admin.from("candidates").update({ ...clean, updated_at: new Date().toISOString() }).eq("id", candidateId);
  if (error) return NextResponse.json({ ok: false, error: error.message });
  await admin.from("audit_log").insert({ actor: user.id, action: "profile_filled_from_whatsapp_reply", entity: "candidate", entity_id: candidateId, detail: { fields: Object.keys(clean) } });
  return NextResponse.json({ ok: true, saved: Object.keys(clean).map((k) => LABEL[k]) });
}
