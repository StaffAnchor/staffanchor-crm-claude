import { generateTextWithFallback } from "@/lib/ai-providers";

// Drafts a LinkedIn Services Marketplace proposal (100 to 1,500 characters) that answers what the person asked for
// and links to the right Pro Session. The owner reviews it and pastes it into LinkedIn; nothing is sent from here.

export const PROPOSAL_MAX = 1500;
export type Offer = { slug: string; title: string; duration_min: number | null; price: string; link: string; what: string };

export function offers(services: { slug: string; title: string; duration_min: number; price_inr: number }[]): Offer[] {
  const inr = (n: number) => `Rs ${n.toLocaleString("en-IN")}`;
  const list: Offer[] = services.map((s) => ({
    slug: s.slug,
    title: s.title,
    duration_min: s.duration_min,
    price: inr(s.price_inr),
    link: `https://clients.staffanchor.com/book/${s.slug}?src=linkedin_proposal`,
    what:
      s.slug === "mock-interview"
        ? "a full mock interview loop for the role you are targeting, then a plain debrief on where you would have been screened out and how to fix it"
        : "a line-by-line resume rewrite, a sharper LinkedIn headline and About, and a map of where your next role actually comes from",
  }));
  list.push({
    slug: "resume-writing",
    title: "Resume Writing",
    duration_min: null,
    price: "from Rs 999",
    link: "https://www.staffanchor.com/resume-writing",
    what: "a professionally written, ATS-friendly resume delivered as Word and PDF",
  });
  return list;
}

function strip(text: string): string {
  return text.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]").replace(/\+?\d[\d\s-]{8,}\d/g, "[number]").slice(0, 4000);
}

export function templateProposal(o: Offer, firstName: string): string {
  const hi = firstName ? `Hi ${firstName},` : "Hi,";
  const len = o.duration_min ? `${o.duration_min}-minute video session` : "service";
  return `${hi}\n\nThank you for reaching out. Based on what you have shared, the best fit is my ${o.title} (${len}, ${o.price}).\n\nIt covers ${o.what}.\n\nI lead StaffAnchor, a recruitment firm focused on sales and revenue roles, so the guidance comes from how hiring managers actually screen.\n\nYou can pick a time and book here: ${o.link}\n\nHappy to answer any questions before you book.\n\nGagan Sharma\nStaffAnchor`;
}

export type ProposalResult = { ok: true; slug: string; proposal: string; fit: "good" | "partial" | "poor"; fitNote: string; ai: boolean } | { ok: false; error: string };

export async function draftProposal(opts: { requestText: string; firstName: string; preferSlug?: string | null; offers: Offer[] }): Promise<ProposalResult> {
  const { offers: all, firstName } = opts;
  const pick = (slug?: string | null) => all.find((o) => o.slug === slug) ?? all[0];
  const text = strip(opts.requestText.trim());
  if (!text) {
    const o = pick(opts.preferSlug);
    return { ok: true, slug: o.slug, proposal: templateProposal(o, firstName), fit: "good", fitNote: "", ai: false };
  }
  const catalog = all.map((o) => `- ${o.slug}: ${o.title}${o.duration_min ? `, ${o.duration_min} minutes` : ""}, ${o.price}. Link: ${o.link}. Covers: ${o.what}.`).join("\n");
  const prompt = `You write replies to LinkedIn Services Marketplace requests for Gagan Sharma, founder of StaffAnchor, a recruitment firm focused on sales and revenue roles. He coaches sales professionals through 1:1 sessions.

The person's request (answers to LinkedIn's project questions):
"""
${text}
"""

Sessions he offers:
${catalog}

Return ONLY JSON: {"service": "<slug>", "fit": "good" | "partial" | "poor", "fitNote": "<one sentence on why, shown to Gagan only>", "proposal": "<the message>"}

Rules for the proposal:
- 600 to 1,100 characters. Plain text, short paragraphs, no markdown, no emojis, no bullet symbols.
- Start with "Hi ${firstName || "there"},". Do not use the person's surname or repeat personal details.
- Address what THEY asked for, in their own terms. Pick the single best-fit session and say what happens in it in two or three short sentences.
- Give the price and duration, then one clear next step using that session's exact link.
- Be honest. Never invent results, testimonials, client counts or guarantees. Never promise a job.
- Sessions are built for sales and revenue professionals. If the person is clearly outside sales, set fit to "poor" or "partial" and say honestly in the proposal what the sessions are and are not suited for, without being dismissive.
- Sign off "Gagan Sharma, StaffAnchor".`;
  try {
    const { text: raw } = await generateTextWithFallback(prompt);
    const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const j = JSON.parse(cleaned) as { service?: string; fit?: string; fitNote?: string; proposal?: string };
    const o = pick(j.service ?? opts.preferSlug);
    let body = (j.proposal ?? "").trim();
    if (body.length < 100) throw new Error("too short");
    if (!body.includes(o.link)) body = `${body}\n\nBook a time here: ${o.link}`;
    if (body.length > PROPOSAL_MAX) {
      const linkLine = `\n\nBook a time here: ${o.link}`;
      body = body.slice(0, PROPOSAL_MAX - linkLine.length - 1).replace(/\s+\S*$/, "") + "…" + linkLine;
    }
    const fit = j.fit === "poor" || j.fit === "partial" ? j.fit : "good";
    return { ok: true, slug: o.slug, proposal: body, fit, fitNote: (j.fitNote ?? "").slice(0, 300), ai: true };
  } catch {
    const o = pick(opts.preferSlug);
    return { ok: true, slug: o.slug, proposal: templateProposal(o, firstName), fit: "good", fitNote: "The AI draft failed, so this is the standard template.", ai: false };
  }
}
