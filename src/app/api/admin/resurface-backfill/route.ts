import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { pickMandatesToResurface, resurfaceMandate } from "@/lib/talent-resurface";

// Admin-triggerable twin of proactive-match-sweep's talent-resurfacing step
// -- lets an admin run a couple of full-candidate-pool scans on demand
// (e.g. right after opening a new mandate) instead of waiting for the next
// Sunday cron. Same "Run now" pattern as practice-tag-backfill/embed-backfill.
const MANDATES_PER_RUN = 3;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") return { error: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
  return { supabase };
}

export async function POST() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 503 });
  }
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY && !process.env.MISTRAL_API_KEY) {
    return NextResponse.json({ ok: false, processed: 0, note: "No AI provider API key configured on this deployment" });
  }

  const admin = createSupabaseClient(supabaseUrl, serviceKey);
  const mandateIds = await pickMandatesToResurface(admin, MANDATES_PER_RUN);
  const results = [];
  for (const mandateId of mandateIds) {
    results.push(await resurfaceMandate(admin, mandateId));
  }

  return NextResponse.json({
    ok: true,
    mandatesScanned: results.length,
    strongHitsTotal: results.reduce((sum, r) => sum + (r.strongHits ?? 0), 0),
    results,
  });
}

// Coverage stats for the AI System Health card: how many open mandates have
// ever had a full-pool resurfacing scan.
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { count: openMandates } = await supabase
    .from("mandates")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
    .eq("is_archived", false);
  const { count: scannedMandates } = await supabase
    .from("mandates")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
    .eq("is_archived", false)
    .not("last_resurface_scan_at", "is", null);

  return NextResponse.json({
    totalOpenMandates: openMandates ?? 0,
    scannedOpenMandates: scannedMandates ?? 0,
    unscannedOpenMandates: (openMandates ?? 0) - (scannedMandates ?? 0),
  });
}
