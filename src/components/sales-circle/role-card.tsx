import Link from "next/link";
import { Building2, Check, MapPin, Sparkles } from "lucide-react";
import { categoryLabel, inr, locationText, roleFacts, type RoleCardData } from "@/lib/sales-circle";

const ACCENT: Record<string, { bar: string; pill: string }> = {
  b2b_sales: { bar: "bg-indigo-500", pill: "bg-indigo-50 text-indigo-700" },
  b2c_sales: { bar: "bg-teal-500", pill: "bg-teal-50 text-teal-700" },
  non_sales: { bar: "bg-slate-400", pill: "bg-slate-100 text-slate-600" },
};

// One role, exactly as a referrer sees it. Used on the referrer's Roles page
// and in the admin's "Preview as referrer", so what you preview is what they get.
// The company name is never shown to referrers, and the data they receive does not contain it.
export default function RoleCard({
  role,
  isNew = false,
  preview = false,
}: {
  role: RoleCardData;
  isNew?: boolean;
  preview?: boolean;
}) {
  const accent = ACCENT[role.category ?? ""] ?? ACCENT.non_sales;
  const where = locationText(role);
  const facts = roleFacts(role);
  const payout = role.payout_amount != null ? Number(role.payout_amount) : null;
  const mustHaves = (role.must_haves ?? []).filter(Boolean);
  const niceToHaves = (role.good_to_haves ?? []).filter(Boolean);

  return (
    <article className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <span className={`absolute inset-y-0 left-0 w-1 ${accent.bar}`} aria-hidden />
      <div className="p-5 pl-6 sm:p-6 sm:pl-7">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[17px] font-semibold leading-snug tracking-tight text-slate-900">{role.role_title}</h2>
              {isNew && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-emerald-700">
                  <Sparkles className="h-3 w-3" /> New
                </span>
              )}
              {role.category && (
                <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${accent.pill}`}>{categoryLabel(role.category)}</span>
              )}
              {!!role.my_referral_count && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700">
                  You&apos;ve referred {role.my_referral_count}
                </span>
              )}
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                Company confidential
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {where ?? "Location flexible"}
              </span>
              {role.sub_domain && <span>{role.sub_domain}</span>}
            </p>
          </div>

          {payout != null ? (
            <div className="shrink-0 rounded-xl bg-emerald-50 px-4 py-2.5 text-right ring-1 ring-emerald-100">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700/70">You earn</div>
              <div className="text-[20px] font-bold leading-tight text-emerald-700">{inr(payout)}</div>
              <div className="text-[10.5px] text-emerald-700/70">per successful hire</div>
            </div>
          ) : (
            <div className="shrink-0 rounded-xl bg-slate-50 px-4 py-2.5 text-right ring-1 ring-slate-100">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Payout</div>
              <div className="text-[13px] font-medium text-slate-500">To be confirmed</div>
            </div>
          )}
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label} className="rounded-lg bg-slate-50 px-3 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{f.label}</dt>
              <dd className={`mt-0.5 text-[13px] font-medium ${f.muted ? "text-slate-400" : "text-slate-800"}`}>{f.value}</dd>
            </div>
          ))}
        </dl>

        {role.referral_summary && <p className="mt-4 text-[13.5px] leading-relaxed text-slate-600">{role.referral_summary}</p>}

        {mustHaves.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Must have</div>
            <ul className="flex flex-wrap gap-1.5">
              {mustHaves.map((m) => (
                <li key={m} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] text-emerald-800">
                  <Check className="h-3 w-3 shrink-0" /> {m}
                </li>
              ))}
            </ul>
          </div>
        )}
        {niceToHaves.length > 0 && (
          <div className="mt-3">
            <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Nice to have</div>
            <ul className="flex flex-wrap gap-1.5">
              {niceToHaves.map((m) => (
                <li key={m} className="rounded-full bg-slate-100 px-2.5 py-1 text-[12px] text-slate-600">
                  {m}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-[12px] text-slate-400">The recruiter screens every referral. You only need to know someone who could fit.</p>
          {preview ? (
            <span className="shrink-0 rounded-lg bg-slate-900/90 px-4 py-2 text-[13px] font-semibold text-white opacity-60">Refer someone →</span>
          ) : (
            <Link
              href={`/referrer/refer?mandate=${role.id}`}
              className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-slate-700"
            >
              Refer someone →
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
