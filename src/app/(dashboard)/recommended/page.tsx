import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RecommendedList, { type RecItem } from "./recommended-list";

export const dynamic = "force-dynamic";

type One<T> = T | T[] | null;
const one = <T,>(v: One<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);

type Row = {
  id: string;
  candidate_id: string;
  mandate_id: string;
  note: string | null;
  status: "new" | "in_pipeline" | "not_a_fit";
  decline_reason: string | null;
  created_at: string;
  seen_at: string | null;
  acted_at: string | null;
  from_user: string;
  to_user: string;
  candidates: One<{ full_name: string | null; phone: string | null; current_job_title: string | null; current_employer: string | null; current_location: string | null; total_experience_years: number | null; current_fixed_ctc: number | null; expected_fixed_ctc: number | null; notice_period: string | null }>;
  mandates: One<{ role_title: string | null; client_name: string | null }>;
};

// The recruiter's own space: people colleagues recommended to them for a role, with what to do about each. Sent
// recommendations are listed underneath so the sender can see what became of them.
export default async function RecommendedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("candidate_recommendations")
    .select("id, candidate_id, mandate_id, note, status, decline_reason, created_at, seen_at, acted_at, from_user, to_user, candidates(full_name, phone, current_job_title, current_employer, current_location, total_experience_years, current_fixed_ctc, expected_fixed_ctc, notice_period), mandates(role_title, client_name)")
    .order("created_at", { ascending: false })
    .limit(300);
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.to_user === user.id || r.from_user === user.id);

  const ids = Array.from(new Set(rows.flatMap((r) => [r.from_user, r.to_user])));
  const { data: profs } = ids.length ? await supabase.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] };
  const nameOf = new Map(((profs ?? []) as { id: string; full_name: string | null; email: string }[]).map((p) => [p.id, p.full_name?.trim() || p.email]));

  const toItem = (r: Row): RecItem => {
    const c = one(r.candidates);
    const m = one(r.mandates);
    return {
      id: r.id,
      candidateId: r.candidate_id,
      mandateId: r.mandate_id,
      name: c?.full_name ?? "Unnamed",
      phone: c?.phone ?? null,
      headline: [c?.current_job_title, c?.current_employer].filter(Boolean).join(" at "),
      location: c?.current_location ?? null,
      years: c?.total_experience_years != null ? Number(c.total_experience_years) : null,
      currentPay: c?.current_fixed_ctc != null ? Number(c.current_fixed_ctc) : null,
      expectedPay: c?.expected_fixed_ctc != null ? Number(c.expected_fixed_ctc) : null,
      notice: c?.notice_period ?? null,
      role: m?.role_title ?? "Role",
      client: m?.client_name ?? null,
      note: r.note,
      status: r.status,
      declineReason: r.decline_reason,
      createdAt: r.created_at,
      seen: !!r.seen_at,
      fromName: nameOf.get(r.from_user) ?? "A colleague",
      toName: nameOf.get(r.to_user) ?? "A colleague",
    };
  };

  const mine = rows.filter((r) => r.to_user === user.id).map(toItem);
  const sent = rows.filter((r) => r.from_user === user.id).map(toItem);
  return <RecommendedList mine={mine} sent={sent} />;
}
