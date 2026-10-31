// Shared by the profile completion page (a server component) and the call desk (a client component), so it lives outside both.

export const GAP_LABEL: Record<string, string> = {
  name: "name", phone: "phone", email: "email", cv: "CV", experience: "experience", current_ctc: "current pay", expected_ctc: "expected pay",
  notice: "notice", city: "city", relocation: "relocation", domain: "domain", sub_domain: "sub-domain", role_level: "role level", employer: "company", title: "job title", role_type: "role type",
};

export const STRENGTH: Record<string, { label: string; cls: string; bar: string }> = {
  strong: { label: "Strong", cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100", bar: "bg-emerald-500" },
  good: { label: "Good", cls: "bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-200", bar: "bg-teal-400" },
  weak: { label: "Weak", cls: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100", bar: "bg-amber-400" },
  poor: { label: "Poor", cls: "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100", bar: "bg-rose-500" },
  unrated: { label: "Not rated", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", bar: "bg-slate-300 dark:bg-slate-600" },
};

/** Vitals: what must be known before anyone calls or matches a person. The rest (expected pay, notice, email, company, title) comes after. */
export const VITAL_KEYS = ["name", "phone", "experience", "current_ctc", "city", "role_level", "role_type", "relocation", "domain", "sub_domain", "cv"] as const;
export const isVital = (k: string) => (VITAL_KEYS as readonly string[]).includes(k);
