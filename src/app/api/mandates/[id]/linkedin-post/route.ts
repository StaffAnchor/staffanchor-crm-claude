import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateTextWithFallback } from "@/lib/ai-providers";

export const runtime = "nodejs";
export const maxDuration = 60;

const JOBS_SITE = process.env.NEXT_PUBLIC_JOBS_SITE_URL ?? "https://jobs.staffanchor.com";

type M = {
  role_title: string; client_name: string | null; show_client_name: boolean | null; public_client_label: string | null;
  city: string | null; cities: string[] | null; budget_min: number | null; budget_max: number | null;
  experience_min: number | null; experience_max: number | null; work_mode: string | null;
  jd_overview: string | null; jd_responsibilities: string | null; jd_candidate_profile: string | null;
  must_haves: string[] | null; status: string | null; short_code: string | null; is_archived: boolean | null;
};

const lines = (v: string | null) => (v ?? "").split("\n").map((l) => l.replace(/^[\s•\-*]+/, "").trim()).filter(Boolean);

function facts(m: M) {
  const cities = m.cities?.length ? m.cities : m.city ? [m.city] : [];
  const client = m.show_client_name !== false ? m.client_name : m.public_client_label?.trim() || null;
  const exp = m.experience_min != null || m.experience_max != null
    ? m.experience_min != null && m.experience_max != null && m.experience_min !== m.experience_max ? `${m.experience_min}-${m.experience_max} years` : `${m.experience_min ?? m.experience_max} years` : null;
  const comp = m.budget_min || m.budget_max
    ? m.budget_min && m.budget_max && m.budget_min !== m.budget_max ? `Rs ${m.budget_min}-${m.budget_max} LPA` : `Rs ${m.budget_min ?? m.budget_max} LPA` : null;
  return { cities, client, exp, comp };
}

// Used when the AI draft fails: a plain post from the mandate's own facts.
function templatePost(m: M): string {
  const f = facts(m);
  const bullets = [f.cities.length ? `Location: ${f.cities.join(", ")}` : null, f.exp ? `Experience: ${f.exp}` : null, f.comp ? `Compensation: ${f.comp}` : null, m.work_mode ? `Work mode: ${m.work_mode}` : null].filter(Boolean);
  const first = lines(m.jd_responsibilities).slice(0, 2).map((x) => `• ${x}`);
  return [
    `We are hiring: ${m.role_title}${f.client ? ` at ${f.client}` : ""}.`,
    m.jd_overview?.trim() ? m.jd_overview.trim().split(/(?<=[.!?])\s+/)[0] : "",
    bullets.map((b) => `• ${b}`).join("\n"),
    first.length ? `What you will do:\n${first.join("\n")}` : "",
    "Know someone who fits? Tag them or share this post.",
  ].filter(Boolean).join("\n\n");
}

// A short LinkedIn feed post for one role, ready to paste. The job link is added here, never left to the AI.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { data } = await supabase
    .from("mandates")
    .select("role_title, client_name, show_client_name, public_client_label, city, cities, budget_min, budget_max, experience_min, experience_max, work_mode, jd_overview, jd_responsibilities, jd_candidate_profile, must_haves, status, short_code, is_archived")
    .eq("id", id)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "That role could not be found." }, { status: 404 });
  const m = data as M;
  const link = m.status === "open" && !m.is_archived && m.short_code ? `${JOBS_SITE}/j/${m.short_code}?utm_source=linkedin&utm_medium=post` : null;
  const f = facts(m);

  const prompt = `Write a short LinkedIn feed post (350 to 700 characters) announcing this open role, for Gagan Sharma, founder of StaffAnchor, a recruitment firm for sales and revenue roles.

Facts you may use (nothing else):
- Role: ${m.role_title}
- Hiring company: ${f.client ?? "not named, call it a confidential client or leave it out"}
- Location: ${f.cities.join(", ") || "not stated"}
- Experience: ${f.exp ?? "not stated"}
- Compensation: ${f.comp ?? "not stated"}
- Work mode: ${m.work_mode ?? "not stated"}
- About the role: ${m.jd_overview?.trim() || "not stated"}
- Responsibilities: ${lines(m.jd_responsibilities).slice(0, 5).join("; ") || "not stated"}
- Who fits: ${lines(m.jd_candidate_profile).slice(0, 4).join("; ") || "not stated"}
- Must have: ${(m.must_haves ?? []).slice(0, 5).join("; ") || "not stated"}

Rules:
- First line is a clear hook that names the role. Plain text, short lines, a blank line between parts, at most four "•" bullets of the key facts.
- No emojis, no hashtags, no markdown, no links (the link is added afterwards).
- Never invent facts, numbers, perks or promises. Skip anything marked "not stated". Do not say "confidential" unless the company is not named.
- End with one line asking people to apply or share with someone who fits.
Return ONLY the post text.`;

  let text = "";
  let ai = true;
  try {
    const { text: raw } = await generateTextWithFallback(prompt);
    text = raw.trim().replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").replace(/https?:\/\/\S+/g, "").replace(/\*\*/g, "").trim();
    if (text.length < 120) throw new Error("too short");
    if (text.length > 1000) text = text.slice(0, 1000).replace(/\s+\S*$/, "");
  } catch {
    text = templatePost(m);
    ai = false;
  }
  const post = link ? `${text}\n\nSee the role and apply: ${link}` : text;
  return NextResponse.json({ ok: true, post, ai, link, hasLink: !!link });
}
