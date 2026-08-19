import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeHealthSnapshot } from "@/lib/pipeline-health";

// Admin-only "is the AI/matching pipeline actually working" view for
// Reports. Computes live (not from the last snapshot) so the numbers are
// always current when an admin opens the page; the daily
// pipeline-health-check cron is what persists snapshots + sends alert
// emails when nobody's looking.
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    const { metrics, alerts } = await computeHealthSnapshot(supabase);
    return NextResponse.json({ metrics, alerts });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
