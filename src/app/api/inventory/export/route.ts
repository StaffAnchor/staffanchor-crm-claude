import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LEVELS } from "@/lib/inventory";

export const runtime = "nodejs";

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// The people behind one number in the Talent Inventory, as a spreadsheet. Staff only.
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const cluster = sp.get("cluster");
  const track = sp.get("track") ?? "b2b_sales";
  if (!cluster) return NextResponse.json({ error: "Missing cluster" }, { status: 400 });
  const level = LEVELS.find((l) => l.key === sp.get("level")) ?? LEVELS[0];

  let q = supabase
    .from("candidate_role_tags")
    .select("seniority, matched_title, metro, is_current, candidates(full_name, email, phone, current_job_title, current_employer, total_experience_years, current_fixed_ctc, expected_fixed_ctc, notice_period, current_location)")
    .eq("cluster_slug", cluster)
    .eq("track", track);
  if (sp.get("domain")) q = q.eq("domain", sp.get("domain") as string);
  if (sp.get("scope") !== "any") q = q.eq("is_current", true);
  if (level.senior) q = q.in("seniority", level.senior);
  if (sp.get("metro")) q = q.eq("metro", sp.get("metro") as string);
  const { data, error } = await q.limit(2000);
  if (error) return NextResponse.json({ error: "Couldn't export." }, { status: 500 });

  type R = { seniority: string; matched_title: string | null; metro: string | null; candidates: Record<string, unknown> | null };
  const lines = [["Name", "Email", "Phone", "Role", "Company", "Level", "City", "Metro", "Experience (yrs)", "Current CTC (LPA)", "Expected CTC (LPA)", "Notice"].join(",")];
  for (const r of (data ?? []) as unknown as R[]) {
    const c = r.candidates ?? {};
    lines.push(
      [c.full_name, c.email, c.phone, r.matched_title ?? c.current_job_title, c.current_employer, r.seniority, c.current_location, r.metro, c.total_experience_years, c.current_fixed_ctc, c.expected_fixed_ctc, c.notice_period].map(cell).join(",")
    );
  }
  return new NextResponse(lines.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="talent-inventory-${cluster}.csv"` } });
}
