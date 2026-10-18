// Answers a recruiter has taught the assistant. A question is answered only when it is clearly the same question as one a
// person already answered; otherwise it goes to a person, and the question joins the "teach the assistant" list.

const STOP = new Set(["the", "and", "for", "are", "you", "your", "what", "when", "where", "how", "can", "could", "would", "will", "does", "this", "that", "with", "have", "has", "was", "were", "about", "from", "please", "tell", "know", "want", "need", "kya", "hai", "hain", "aap", "mera", "mujhe", "ka", "ki", "ke", "ko", "se", "me", "mein", "hoga", "karna", "the", "its", "any", "there", "get", "give", "also", "just", "like", "much", "many", "some", "who", "which", "why", "is", "do", "of", "to", "in", "on", "at", "it", "be", "an", "my", "we", "our"]);

export const normalizeQuestion = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "");

export const questionKeywords = (t: string): string[] => Array.from(new Set(normalizeQuestion(t).split(" ").filter((w) => w.length > 2 && !STOP.has(w)).map(stem).filter((w) => w.length > 1)));

/** Looks like a question a person asked, rather than an answer to one of ours. */
export const isQuestion = (t: string): boolean => {
  const s = t.trim();
  if (s.length < 6) return false;
  return /\?/.test(s) || /^(what|how|when|where|why|who|which|can|could|do|does|is|are|will|would|kya|kab|kitna|kaise|kyun|kaun)\b/i.test(s);
};

export type FaqAnswer = { id: string; question: string; keywords: string[]; answer: string };

/** How alike two questions are, 0 to 1 (shared keywords, weighed against both lengths). */
export function similarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const set = new Set(b);
  const shared = a.filter((w) => set.has(w)).length;
  return shared < 2 && Math.min(a.length, b.length) > 1 ? 0 : (2 * shared) / (a.length + b.length);
}

export function bestAnswer(question: string, answers: FaqAnswer[], threshold = 0.6): FaqAnswer | null {
  const kw = questionKeywords(question);
  let best: FaqAnswer | null = null;
  let score = 0;
  for (const a of answers) {
    const s = similarity(kw, a.keywords);
    if (s > score) {
      score = s;
      best = a;
    }
  }
  return best && score >= threshold ? best : null;
}
