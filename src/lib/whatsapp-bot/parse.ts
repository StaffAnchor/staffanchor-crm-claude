// Readers for what people type into WhatsApp. Each returns a clean value, or null when it
// can't be sure. A wrong guess saved on a profile is worse than asking again.

// Capitalise words typed all in lowercase ("noida" -> "Noida") or all in capitals ("DELHI" ->
// "Delhi"); leave short codes ("UP") and mixed case ("McDonald") alone.
const titleCase = (s: string) =>
  s
    .split(/(\s+)/)
    .map((w) => {
      if (!w.trim()) return w;
      if (w === w.toLowerCase()) return w.replace(/(^|[.'-])(\p{L})/gu, (_, a: string, c: string) => a + c.toUpperCase());
      if (w === w.toUpperCase() && w.replace(/\W/g, "").length > 3) return w[0] + w.slice(1).toLowerCase();
      return w;
    })
    .join("");

const collapse = (s: string) => s.trim().replace(/\s+/g, " ");

// A question or a request is never a name, a job title or a city.
export const looksLikeQuestion = (s: string) =>
  s.includes("?") || /^(what|why|how|when|where|who|which|can|could|do|does|is|are|will|would|please|kindly|tell|send|give|share|i want|i need|i would|i have|i am not|i'm not)\b/i.test(s.trim());

// A greeting or one-word reply is not a name.
const NOT_A_NAME = new Set(["hi", "hii", "hello", "hey", "yes", "no", "ok", "okay", "thanks", "thank you", "test", "testing", "interested", "yo", "hlo", "sure", "start", "menu"]);

export function parseName(raw: string): string | null {
  if (NOT_A_NAME.has(raw.trim().toLowerCase().replace(/[.!]+$/, "")) || looksLikeQuestion(raw)) return null;
  let t = collapse(raw).replace(/^(my name is|name is|name:|i am|i'm|im|this is|it's|its)\s+/i, "");
  t = t.replace(/[.,!]+$/, "");
  if (!/^[\p{L}][\p{L} .'-]{1,59}$/u.test(t)) return null;
  if (t.split(" ").length > 6) return null;
  return titleCase(t);
}

export function parseRoleCompany(raw: string): { title: string; company: string | null } | null {
  const t = collapse(raw);
  if (t.length < 2 || t.length > 160 || /@\S+\.\S+/.test(t) || /https?:\/\//i.test(t) || looksLikeQuestion(t)) return null;
  // Prefer "Role at Company", then "Role - Company", then "Role, Company". Split once only,
  // so a title that itself contains a comma ("Senior Manager, North India at Acme") stays whole.
  const m = t.match(/^(.*?)\s+(?:at|@|with)\s+(.+)$/i) ?? t.match(/^(.*?)\s+[-–—]\s+(.+)$/) ?? t.match(/^(.*?),\s+(.+)$/);
  const title = (m ? m[1] : t).trim();
  const company = m ? m[2].trim() : null;
  if (title.length < 2 || title.length > 80 || title.split(" ").length > 8) return null;
  if (company && company.length > 80) return null;
  return { title: titleCase(title), company: company ? titleCase(company) : null };
}

/** Total years of experience, to the nearest half year. "fresher" is 0. */
export function parseExperienceYears(raw: string): number | null {
  const t = raw.toLowerCase().replace(/,/g, "").trim();
  if (/^(fresher|no experience|nil|none|zero)$/.test(t)) return 0;
  const years = t.match(/(\d+(?:\.\d+)?)\s*(?:\+\s*)?(?:years?|yrs?|y)\b/);
  const months = t.match(/(\d+(?:\.\d+)?)\s*(?:months?|mos?|m)\b/);
  let value: number | null = null;
  if (years) value = parseFloat(years[1]) + (months ? parseFloat(months[1]) / 12 : 0);
  else if (months) value = parseFloat(months[1]) / 12;
  else {
    const bare = t.match(/^(\d+(?:\.\d+)?)\s*\+?$/);
    if (bare) value = parseFloat(bare[1]);
  }
  if (value == null || !Number.isFinite(value) || value < 0 || value > 50) return null;
  return Math.round(value * 2) / 2;
}

/** A yearly CTC in lakhs (6.5 = ₹6.5 lakh). Understands lakh, LPA, crore, full rupees and monthly figures. */
export function parseCtcLakhs(raw: string, opts: { allowZero?: boolean } = {}): number | null {
  const t = raw.toLowerCase().replace(/[,₹]/g, "").replace(/\b(rs|inr|rupees)\.?/g, "").trim();
  if (/^(0|nil|none|fresher|not working|na|n\/a)$/.test(t)) return opts.allowZero ? 0 : null;
  if (/\d\s*(?:-|to)\s*\d/.test(t)) return null; // a range: ask for one number
  const monthly = /\b(per month|a month|\/ ?month|pm|monthly|p\.m)\b/.test(t);
  let v: number | null = null;
  const cr = t.match(/(\d+(?:\.\d+)?)\s*(?:cr|crore|crores)\b/);
  const lakh = t.match(/(\d+(?:\.\d+)?)\s*(?:l|lac|lacs|lakh|lakhs|lpa)\b/);
  const k = t.match(/(\d+(?:\.\d+)?)\s*k\b/);
  const plain = t.match(/^(\d+(?:\.\d+)?)\b/);
  if (cr) v = parseFloat(cr[1]) * 100;
  else if (lakh) v = parseFloat(lakh[1]) * (monthly ? 12 : 1);
  else if (k) {
    // "50k" in India almost always means a monthly salary, unless they say it is per year.
    const yearly = /\b(per year|a year|per annum|pa|annual|annually|yearly|lpa)\b/.test(t);
    v = (parseFloat(k[1]) * 1000 * (yearly ? 1 : 12)) / 100000;
  }
  else if (plain) {
    const n = parseFloat(plain[1]);
    if (monthly) v = (n * 12) / 100000;
    else if (n >= 10000) v = n / 100000; // full rupees
    else v = n; // already lakhs
  }
  if (v == null || !Number.isFinite(v)) return null;
  v = Math.round(v * 10) / 10;
  if (v === 0 && opts.allowZero) return 0;
  return v >= 0.5 && v <= 500 ? v : null;
}

export const NOTICE_OPTIONS = ["Immediate", "15 days", "30 days", "60 days", "90 days", "90+ days"] as const;

/** Maps what someone says onto the notice-period options the registration form uses. */
export function parseNoticePeriod(raw: string): (typeof NOTICE_OPTIONS)[number] | null {
  const t = raw.toLowerCase().replace(/,/g, "").trim();
  let days: number | null = null;
  const re = /(\d+(?:\.\d+)?)\s*(days?|d|weeks?|w|months?|m)\b/g;
  let m: RegExpExecArray | null;
  let found = false;
  let total = 0;
  while ((m = re.exec(t))) {
    found = true;
    const n = parseFloat(m[1]);
    const unit = m[2][0];
    total += unit === "d" ? n : unit === "w" ? n * 7 : n * 30;
  }
  if (found) days = total;
  else if (/\b(immediate|immediately|asap|right away|available now|no notice|nil|joined|can join now|already served)\b/.test(t)) days = 0;
  else if (/^\d+$/.test(t)) days = parseInt(t, 10); // a bare number is days
  if (days == null || days < 0 || days > 365) return null;
  if (days === 0) return "Immediate";
  if (days <= 15) return "15 days";
  if (days <= 30) return "30 days";
  if (days <= 60) return "60 days";
  if (days <= 90) return "90 days";
  return "90+ days";
}

export function parseLocation(raw: string): string | null {
  if (looksLikeQuestion(raw)) return null;
  let t = collapse(raw).replace(/^(i am |i'm |im |based |living |located |currently |presently )?(in|at|from|near)\s+/i, "");
  t = t.replace(/[.!]+$/, "");
  if (!/^[\p{L}][\p{L} ,.'-]{1,59}$/u.test(t) || t.split(/\s+/).length > 5) return null;
  return titleCase(t);
}

export function parseEmail(raw: string): string | null {
  const m = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/i);
  if (!m) return null;
  const e = m[0].toLowerCase();
  return e.length <= 120 ? e : null;
}

export type CategoryAnswer = "b2b_sales" | "b2c_sales" | "non_sales";
export function parseCategory(raw: string): CategoryAnswer | null {
  const t = raw.toLowerCase().trim();
  if (/^1\b|^1$/.test(t)) return "b2b_sales";
  if (/^2\b|^2$/.test(t)) return "b2c_sales";
  if (/^3\b|^3$/.test(t)) return "non_sales";
  if (/not in sales|non[- ]?sales|\bother\b|no sales|not sales/.test(t)) return "non_sales";
  const b2b = /\bb2b\b|business to business|enterprise|saas|selling to businesses/.test(t);
  const b2c = /\bb2c\b|consumer|retail|d2c|selling to consumers/.test(t);
  if (b2b && !b2c) return "b2b_sales";
  if (b2c && !b2b) return "b2c_sales";
  return null;
}

// Words that mean something to the conversation itself, not to a question.
const only = (t: string, words: string[]) => new RegExp(`^(?:${words.join("|")})[.!\\s]*$`, "i").test(t.trim());
export const isStop = (t: string) => only(t, ["stop", "unsubscribe", "opt out", "optout", "cancel", "stop messages"]);
export const isRestart = (t: string) => only(t, ["restart", "start over", "profile", "start", "begin", "register"]);
export const isHuman = (t: string) => only(t, ["human", "agent", "recruiter", "help", "call me", "talk to someone", "talk to a recruiter"]);
export const isSkip = (t: string) => only(t, ["skip", "pass", "later", "not now", "prefer not to say", "na", "n/a"]);
