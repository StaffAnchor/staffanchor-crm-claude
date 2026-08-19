import { generateTextWithFallback } from "@/lib/ai-providers";

export type OutreachChannel = "linkedin" | "email";

export type OutreachDraftResult =
  | { ok: true; draft: string }
  | { ok: false; status: number; error: string };

function parseDraftJson(raw: string): { draft?: string } | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object") return parsed as { draft?: string };
  } catch {
    // fall through
  }
  return null;
}

/**
 * Drafts a personalized outbound message (LinkedIn DM or cold email) to a
 * sales-lead prospect, so the founder reviews/edits and sends instead of
 * writing from scratch every time -- the "AI-drafted outreach" half of the
 * 4-5-AEs-worth-of-help ask. Same house pattern as generate-reply-draft.ts:
 * model fallback list, JSON-only response, never throws.
 */
export async function generateSalesOutreach(input: {
  channel: OutreachChannel;
  company_name: string;
  contact_name?: string | null;
  contact_title?: string | null;
  company_industry?: string | null;
  company_size?: string | null;
  source?: string | null;
  notes?: string | null;
  stage?: string | null;
  // Overridable so an ad hoc draft (company spotted on LinkedIn, not yet a
  // sales_leads row) can still be signed correctly; defaults to the founder.
  sender_name?: string | null;
  // Per-user outreach persona (profiles.outreach_sender_bio) -- lets a rep
  // other than the founder draft in their own voice/credibility instead of
  // every message claiming "16 years leading sales teams" regardless of who
  // is actually sending it. One free-text sentence of background, e.g.
  // "I run partnerships at StaffAnchor and spent 6 years in SaaS sales
  // before this." Falls back to the original founder credibility line.
  sender_bio?: string | null;
  // The specific open role spotted on LinkedIn (e.g. "Inside Sales
  // Specialist") -- lets the opener reference it directly ("I understand
  // you are hiring for X") instead of a generic "growing your sales team".
  role_hint?: string | null;
}): Promise<OutreachDraftResult> {
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY && !process.env.MISTRAL_API_KEY) {
    return { ok: false, status: 503, error: "AI outreach drafting is not configured (no AI provider API key set)." };
  }

  const contextLines = [
    `Company: ${input.company_name}`,
    input.contact_name ? `Contact: ${input.contact_name}${input.contact_title ? ` (${input.contact_title})` : ""}` : null,
    input.role_hint ? `Role they appear to be hiring for: ${input.role_hint}` : null,
    input.company_industry ? `Industry: ${input.company_industry}` : null,
    input.company_size ? `Company size: ${input.company_size}` : null,
    input.source ? `How this lead came in: ${input.source}` : null,
    input.notes ? `Notes on this prospect: ${input.notes}` : null,
    input.stage ? `Current pipeline stage: ${input.stage}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const channelInstructions =
    input.channel === "linkedin"
      ? "Write a LinkedIn connection/DM message. 2-4 short sentences, no subject line, no email-style greeting like 'Dear' or sign-off with a full name -- just a first-name opener if you have one."
      : "Write a cold email. Include a short, plain subject line on its own first line prefixed 'Subject: ', then the email body. Keep the body to 3-5 short sentences, and sign off with just a first name placeholder.";

  const senderName = input.sender_name?.trim() || "Gagan";
  const senderBio = input.sender_bio?.trim() || null;
  const senderRoleIntro = senderBio ? "at StaffAnchor" : "founder of StaffAnchor";

  const prompt = `You are drafting a first-person outreach message for ${senderName}, ${senderRoleIntro} -- a recruitment firm that focuses solely on Revenue/Sales roles hiring for B2B / Enterprise SaaS companies (Account Executives, SDRs/BDRs, Sales Leaders, Inside Sales Specialists, Customer Success/Revenue roles). ${senderName} sends this himself/herself -- write it in first person ("I"), not as a company/brand voice.

VOICE -- this is the single most important instruction. Match this register exactly: plain, direct, unpolished, zero marketing language. Short sentences. State facts flatly instead of dressing them up. No metaphors, no "I understand how challenging X is", no "the exact profile that drives results", no "hire with confidence", no "reduce ramp time", no "data-backed", no "passionate", no "synergy", no exclamation points. This is a busy founder messaging another busy founder -- respect their time and don't perform enthusiasm.

Here is the exact voice and structure to follow (a real message ${senderName} wrote and approved -- match this level of plainness and directness, not this exact wording):
"Hi Sanchit, I understand you are hiring for Inside Sales professionals. I run StaffAnchor, which focuses on Revenue Roles hiring. Before I started this, I spent 16 years managing large Sales teams and deeply understand what it takes to hire the right sales talent. If you're open to working with external hiring partners, happy to connect."

Structure to follow, adapted to the context below:
1. Open by naming the specific reason for reaching out -- if a role they're hiring for is given in the context, name it directly ("I understand you are hiring for X"); if not, keep this opener general rather than inventing a role.
2. One plain sentence stating what StaffAnchor does (Revenue/Sales roles hiring for B2B/Enterprise SaaS companies) -- not a pitch, just a fact.
3. One sentence of credibility: ${
    senderBio
      ? `use this background, adapted to flow naturally in first person -- "${senderBio}"`
      : `before this, ${senderName} spent 16 years leading large B2B/Enterprise SaaS sales and revenue teams, so he knows firsthand what it takes to hire the right sales talent`
  }.
4. Close with a soft, low-pressure ask about being open to working with an external hiring partner -- not "let's hop on a call" or "I'd love to connect" (too eager), something closer to "if you're open to it, happy to connect."

Do not invent facts about the company that aren't given below (funding, headcount, specific detail beyond a named role) -- if you don't have a detail, keep it general rather than inventing one.

Context:
${contextLines || "(no further context provided)"}

Return ONLY JSON, no markdown fence:
{"draft": "the message text${input.channel === "email" ? " including the Subject: line" : ""}"}`;

  try {
    const { text: raw } = await generateTextWithFallback(prompt);
    const parsed = parseDraftJson(raw);
    if (!parsed?.draft) {
      return { ok: false, status: 500, error: "AI outreach drafting failed. Please try again." };
    }
    return { ok: true, draft: parsed.draft };
  } catch (err) {
    console.error("sales-outreach generation failed on every configured AI provider", err);
    const message =
      err instanceof Error && err.message.includes("429")
        ? "All configured AI providers hit their free-tier quota. Try again later."
        : "AI outreach drafting failed. Please try again.";
    return { ok: false, status: 500, error: message };
  }
}
