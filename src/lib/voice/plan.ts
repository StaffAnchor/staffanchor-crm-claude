// What the voice agent asks one person about one role: the profile details still missing, the interest check, whether
// they are already in touch with the company, and the practical questions. The prompt is for the agent platform; the
// plan is also shown to the recruiter before anyone is called.

export type GapKey = "current_ctc" | "expected_ctc" | "notice" | "relocation" | "city" | "work_mode";

export type PlanCandidate = {
  full_name: string | null;
  current_fixed_ctc: number | null;
  expected_fixed_ctc: number | null;
  notice_period: string | null;
  open_to_relocation: string | null;
  current_location: string | null;
  work_mode: string | null;
};
export type PlanMandate = { role_title: string; cities: string[] | null; work_mode: string | null; client_name: string | null; budget_text?: string | null };

export type CallPlan = {
  gaps: GapKey[];
  roleTitle: string;
  cities: string[];
  /** Only set when this campaign may name the company. */
  companyName: string | null;
  firstName: string;
  opening: string;
  questions: string[];
  prompt: string;
};

const GAP_ASK: Record<GapKey, string> = {
  current_ctc: "What is your current fixed pay a year, and is there a variable part on top?",
  expected_ctc: "What fixed pay would you want for a move?",
  notice: "What is your notice period, and could it be shortened or bought out?",
  relocation: "Would you be open to moving to {city} if the role needs it?",
  city: "Which city are you based in right now?",
  work_mode: "Do you prefer working from office, hybrid or remote?",
};

export function gapsFor(c: PlanCandidate): GapKey[] {
  const g: GapKey[] = [];
  if (c.current_fixed_ctc == null) g.push("current_ctc");
  if (c.expected_fixed_ctc == null) g.push("expected_ctc");
  if (!c.notice_period) g.push("notice");
  if (!c.open_to_relocation) g.push("relocation");
  if (!c.current_location) g.push("city");
  if (!c.work_mode) g.push("work_mode");
  return g;
}

export function buildPlan(c: PlanCandidate, m: PlanMandate, nameCompany: boolean): CallPlan {
  const gaps = gapsFor(c);
  // "Mumbai (MMR)" is said as "Mumbai".
  const cities = (m.cities ?? []).filter(Boolean).map((c) => c.replace(/\s*\(.*?\)\s*/g, " ").trim());
  const firstName = (c.full_name ?? "").trim().split(/\s+/)[0] || "there";
  const companyName = nameCompany && m.client_name ? m.client_name : null;
  const where = cities.length ? ` in ${cities.join(" or ")}` : "";
  const roleLine = `a ${m.role_title} role${where}${companyName ? ` with ${companyName}` : ""}`;
  const opening = `Hello ${firstName}, this is StaffAnchor's assistant. This call may be recorded. You applied for ${roleLine}. Is this a good time for two minutes?`;

  const questions: string[] = [`Are you still interested in ${roleLine}?`];
  for (const k of gaps) questions.push(GAP_ASK[k].replace("{city}", cities[0] ?? "the role's city"));
  questions.push(
    companyName ? `Have you spoken to ${companyName} before, or been interviewed there in the last year?` : "Are you already in touch about this role through another agency or directly with the company, or have you interviewed for it before?",
    "Do you have any other offers or interviews running at the moment?",
    "When could you take an interview, and when is a good time for our recruiter to call you?"
  );

  const prompt = `You are the voice assistant of StaffAnchor, a recruitment firm for sales and revenue roles in India. You are phoning ${firstName}, who applied for ${roleLine}.

Language: start in the language of the opening. If the person answers in Hindi, Hinglish or English, continue in that same language and style. Speak simply and politely, like a friendly recruiter.

Opening (say it first, nothing before it): "${opening}"
If they say it is not a good time, ask for a better time to call back, thank them and end the call. If they ask you not to call again, say you will make a note, apologise and end the call.

Rules:
- Say you are an assistant only if asked, and never claim to be human. Never promise a job, a salary or an interview.
- ${companyName ? `You may name ${companyName}.` : "Do not name the hiring company. Say \"the company\" or \"the client\"."}
- Keep the call under four minutes. Ask one question at a time and wait for the answer. Do not read the list out.
- If an answer is unclear, ask once more. If still unclear, move on. Never guess a number.
- If they are not interested, ask for the reason in one question, thank them and end the call.

Ask these, in this order, skipping any they have already answered:
${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Pay: repeat back what you heard ("so that is 18 lakh fixed, is that right?") before moving on.

End: thank them, say a StaffAnchor recruiter will call at the time they gave, and finish.`;

  return { gaps, roleTitle: m.role_title, cities, companyName, firstName, opening, questions, prompt };
}
