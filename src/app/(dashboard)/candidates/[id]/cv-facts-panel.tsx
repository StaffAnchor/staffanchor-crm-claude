import { FileSearch } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { CvFacts, CvRole } from "@/lib/cv-facts";

const FLAG_LABEL: Record<string, string> = {
  gap: "Gap",
  short_stints: "Short stints",
  claim_not_backed: "Claim not backed",
  inconsistent: "Inconsistent",
  other: "Note",
};

function Chip({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "teal" }) {
  const cls =
    tone === "teal"
      ? "bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-200"
      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[12px] ${cls}`}>{children}</span>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 py-1.5">
      <p className="text-[12px] text-slate-500 dark:text-slate-400 pt-0.5">{label}</p>
      <div className="min-w-0 text-[13px] text-slate-800 dark:text-slate-200">{children}</div>
    </div>
  );
}

function RoleLine({ r }: { r: CvRole }) {
  const dates = [r.start, r.is_current ? "present" : r.end].filter(Boolean).join(" to ");
  const tags = [r.customer_type?.toUpperCase(), ...r.segments, r.motion].filter(Boolean) as string[];
  const facts = [r.deal_size && `Deal size: ${r.deal_size}`, r.quota_or_target && `Target: ${r.quota_or_target}`, r.achievement && `Result: ${r.achievement}`, r.team_size != null && `Team: ${r.team_size}`].filter(Boolean) as string[];
  return (
    <li className="py-2.5 border-t border-slate-100 dark:border-slate-800 first:border-t-0">
      <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100">
        {r.title ?? "Role"} {r.company ? <span className="font-normal text-slate-600 dark:text-slate-300">at {r.company}</span> : null}
      </p>
      <p className="text-[12px] text-slate-500 dark:text-slate-400">
        {[dates, r.industry].filter(Boolean).join(" · ")}
        {r.sells ? ` · Sells: ${r.sells}` : ""}
      </p>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {tags.map((t) => (
            <Chip key={t}>{t}</Chip>
          ))}
        </div>
      )}
      {facts.length > 0 && <p className="text-[12px] text-slate-600 dark:text-slate-300 mt-1">{facts.join(" · ")}</p>}
    </li>
  );
}

// What the AI read from this candidate's CV. Internal only. Everything
// shown is stated in the CV; anything missing is simply not shown, so an
// empty row means "the CV doesn't say", not "no".
export default async function CvFactsPanel({ candidateId }: { candidateId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("candidate_cv_facts").select("facts, model, extracted_at").eq("candidate_id", candidateId).maybeSingle();

  const header = (
    <div className="flex items-center gap-2 mb-2">
      <FileSearch className="w-4 h-4 text-teal-600" aria-hidden />
      <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Read from the CV</h3>
    </div>
  );

  if (!data) {
    return (
      <div>
        {header}
        <p className="text-[13px] text-slate-500 dark:text-slate-400">
          Not read yet. A CV is read automatically when the candidate&apos;s summary is generated, or by an admin from Analytics, then Reports.
        </p>
      </div>
    );
  }

  const f = data.facts as CvFacts;
  const s = f.sales;
  const salesChips = [
    s.customer_type && s.customer_type.toUpperCase(),
    ...s.segments,
    s.primary_motion,
    s.hunter_or_farmer !== "unclear" ? s.hunter_or_farmer : null,
    s.owned_full_cycle === "yes" ? "Owns full cycle" : s.owned_full_cycle === "no" ? "Part of the cycle only" : null,
    s.leads_team ? (s.largest_team_size ? `Leads a team (up to ${s.largest_team_size})` : "Leads a team") : null,
  ].filter(Boolean) as string[];

  return (
    <div>
      {header}
      <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-2">
        Read on {new Date(data.extracted_at as string).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}. Only what the CV states is shown.
      </p>

      {f.flags.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3">
          <p className="text-[12px] font-medium text-amber-900 dark:text-amber-200 mb-1">Worth checking on the call</p>
          <ul className="space-y-1">
            {f.flags.map((fl, i) => (
              <li key={i} className="text-[13px] text-amber-900 dark:text-amber-100">
                <span className="font-medium">{FLAG_LABEL[fl.kind] ?? "Note"}:</span> {fl.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {f.headline_claim && <Row label="Headline">{f.headline_claim}</Row>}
        {f.experience_years_from_dates != null && <Row label="Experience">{f.experience_years_from_dates} years from the dated roles</Row>}
        {salesChips.length > 0 && (
          <Row label="Sales profile">
            <div className="flex flex-wrap gap-1.5">
              {salesChips.map((c) => (
                <Chip key={c} tone="teal">
                  {c}
                </Chip>
              ))}
            </div>
            {(s.typical_deal_size || s.sales_cycle || s.best_achievement) && (
              <p className="mt-1.5 text-[12px] text-slate-600 dark:text-slate-300">
                {[s.typical_deal_size && `Deal size: ${s.typical_deal_size}`, s.sales_cycle && `Cycle: ${s.sales_cycle}`, s.best_achievement && `Best: ${s.best_achievement}`].filter(Boolean).join(" · ")}
              </p>
            )}
          </Row>
        )}
        {f.industries.length > 0 && <Row label="Industries">{f.industries.join(", ")}</Row>}
        {f.tools.length > 0 && <Row label="Tools">{f.tools.join(", ")}</Row>}
        {f.education.length > 0 && (
          <Row label="Education">{f.education.map((e) => [e.degree, e.institution, e.year].filter(Boolean).join(", ")).join(" · ")}</Row>
        )}
        {f.certifications.length > 0 && <Row label="Certifications">{f.certifications.join(", ")}</Row>}
      </div>

      {f.roles.length > 0 && (
        <details className="mt-3" open>
          <summary className="cursor-pointer text-[13px] font-medium text-slate-700 dark:text-slate-200">Job by job ({f.roles.length})</summary>
          <ul className="mt-1">
            {f.roles.map((r, i) => (
              <RoleLine key={i} r={r} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
