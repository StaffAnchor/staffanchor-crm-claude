import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCsv, csvResponse } from "@/lib/csv";

// Mirrors the filter set on mandates/page.tsx (status, category, city, client).
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in", { status: 401 });

  const params = req.nextUrl.searchParams;
  let query = supabase
    .from("mandates")
    .select("id, role_title, client_name, category, city, status, created_at")
    .order("created_at", { ascending: false })
    .limit(5000);

  const status = params.get("status");
  const category = params.get("category");
  const city = params.get("city");
  const client = params.get("client");

  if (status) query = query.eq("status", status);
  if (category) query = query.eq("category", category);
  if (city) query = query.eq("city", city);
  if (client) query = query.eq("client_name", client);

  const { data: mandates, error } = await query;
  if (error) return new Response(error.message, { status: 500 });

  // Pull linked-candidate + shortlisted counts in one extra query so the
  // export isn't just a bare list of role titles. Derived from `stage`, not
  // the legacy in_shortlist flag -- see clients/page.tsx for why.
  const mandateIds = (mandates ?? []).map((m) => m.id);
  const { data: links } = mandateIds.length
    ? await supabase.from("candidate_mandate_links").select("mandate_id, stage").in("mandate_id", mandateIds)
    : { data: [] as { mandate_id: string; stage: string | null }[] };
  const SHORTLISTED_STAGES = new Set(["client_shortlisted", "offer", "placed"]);
  const linkedCount: Record<string, number> = {};
  const shortlistedCount: Record<string, number> = {};
  (links ?? []).forEach((l) => {
    linkedCount[l.mandate_id] = (linkedCount[l.mandate_id] ?? 0) + 1;
    if (l.stage && SHORTLISTED_STAGES.has(l.stage)) {
      shortlistedCount[l.mandate_id] = (shortlistedCount[l.mandate_id] ?? 0) + 1;
    }
  });

  const headers = ["Role", "Client", "Function", "City", "Status", "Linked Candidates", "Shortlisted+", "Created"];
  const rows = (mandates ?? []).map((m) => [
    m.role_title,
    m.client_name,
    m.category,
    m.city,
    m.status,
    linkedCount[m.id] ?? 0,
    shortlistedCount[m.id] ?? 0,
    m.created_at ? new Date(m.created_at).toLocaleDateString() : "",
  ]);

  const csv = toCsv(headers, rows);
  return csvResponse(`mandates-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
