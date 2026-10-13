import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { shortLink } from "@/lib/marketing/pipeline-roles";
import MarketingClient, { type PipelineRow } from "./marketing-client";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/today");

  const { data: mandates } = await supabase
    .from("mandates")
    .select("id, role_title, city, status, short_code, created_at, experience_min, experience_max, sub_domain")
    .eq("listing_kind", "pipeline")
    .order("created_at", { ascending: false })
    .limit(60);
  const ids = (mandates ?? []).map((m) => m.id);

  const [{ data: posts }, { data: links }] = await Promise.all([
    ids.length ? supabase.from("marketing_posts").select("mandate_id, body, copied_at, created_at").in("mandate_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("candidate_mandate_links").select("mandate_id").in("mandate_id", ids) : Promise.resolve({ data: [] }),
  ]);

  const postBy = new Map<string, { body: string; copied_at: string | null }>();
  for (const p of (posts ?? []) as { mandate_id: string; body: string; copied_at: string | null }[]) if (!postBy.has(p.mandate_id)) postBy.set(p.mandate_id, p);
  const applied = new Map<string, number>();
  for (const l of (links ?? []) as { mandate_id: string }[]) applied.set(l.mandate_id, (applied.get(l.mandate_id) ?? 0) + 1);

  const rows: PipelineRow[] = (mandates ?? []).map((m) => ({
    id: m.id,
    role_title: m.role_title,
    city: m.city,
    status: m.status,
    created_at: m.created_at,
    experience: m.experience_min != null ? `${m.experience_min}-${m.experience_max ?? m.experience_min}+ yrs` : null,
    sub_domain: m.sub_domain,
    link: m.short_code ? shortLink(m.short_code) : null,
    post: postBy.get(m.id)?.body ?? null,
    copied: !!postBy.get(m.id)?.copied_at,
    applicants: applied.get(m.id) ?? 0,
  }));

  return <MarketingClient rows={rows} />;
}
