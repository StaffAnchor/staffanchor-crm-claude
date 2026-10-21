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

const tag = (w: string) => "#" + w.replace(/[^a-zA-Z0-9]/g, "");

// Used when the AI draft fails: the same short layout, from the mandate's own facts.
function templatePost(m: M): string {
  const f = facts(m);
  const role = tag(m.role_title.split(/[\/,(]/)[0].trim().split(/\s+/).map((w) => w[0]?.toUpperCase() + w.slice(1)).join(""));
  return [
    `📢 We're Hiring | ${m.role_title} for a leading company!`,
    [f.cities.length ? `📍 Location: ${f.cities.join(" & ")}` : "", f.exp ? `Experience: ${f.exp}` : "", "Compensation: As per industry standards"].filter(Boolean).join("\n"),
    "Candidates with relevant experience are encouraged to apply.",
    "🔗 Apply through the link in the comments.",
    `#Hiring ${role} #JobOpportunity`,
  ].join("\n\n");
}

// A very short LinkedIn hiring post for one role. The job link goes in a separate first comment (LinkedIn shows posts
// with links in the body to fewer people), and is built here, never left to the AI.
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

  const prompt = `Write a very short LinkedIn hiring post for StaffAnchor (a recruitment firm for sales and revenue roles), in exactly this layout:

📢 We're Hiring | <Role> for <a short description of the hiring company>!

📍 Location: <cities, joined with " & ">
Experience: <range, with an en dash, e.g. 3–8 years>
Compensation: As per industry standards

<one short sentence on who should apply>

🔗 Apply through the link in the comments.

<three or four hashtags>

Facts (use nothing else):
- Role: ${m.role_title}
- Hiring company: ${f.client ?? "not named"}
- What the company does (from the role description): ${m.jd_overview?.trim() || "not stated"}
- Location: ${f.cities.join(", ") || "not stated"}
- Experience: ${f.exp ?? "not stated"}
- Who fits: ${lines(m.jd_candidate_profile).slice(0, 3).join("; ") || lines(m.jd_responsibilities).slice(0, 3).join("; ") || "not stated"}

Rules:
- Keep the layout and the emojis shown. Never write the actual compensation figure; the line says "As per industry standards".
- Company description: if the company is not named, use "a leading" plus the kind of business the facts support (for example "a leading automotive marketplace"); never guess a business the facts do not support. If the company is named in the facts, you may name it.
- Skip the Location or Experience line if it is "not stated".
- The who-should-apply sentence is at most 20 words and uses only the facts.
- Hashtags: #Hiring first, then the role and the industry. No other text, no link, no markdown.
Return ONLY the post.`;

  let text = "";
  let ai = true;
  try {
    const { text: raw } = await generateTextWithFallback(prompt);
    text = raw.trim().replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").replace(/https?:\/\/\S+/g, "").replace(/\*\*/g, "").trim();
    if (text.length < 80 || text.length > 700 || !text.includes("link in the comments")) throw new Error("bad shape");
  } catch {
    text = templatePost(m);
    ai = false;
  }
  return NextResponse.json({ ok: true, post: text, comment: link ? `Apply here: ${link}` : null, ai, hasLink: !!link });
}
