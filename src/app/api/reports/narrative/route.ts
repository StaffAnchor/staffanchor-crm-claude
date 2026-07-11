import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateReportsNarrative, type ReportsNarrativeInput } from "@/lib/reports-narrative";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["admin", "recruiter"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const body = (await req.json()) as Partial<ReportsNarrativeInput>;
  if (!body || typeof body.rangeLabel !== "string") {
    return NextResponse.json({ error: "rangeLabel is required" }, { status: 400 });
  }

  const input: ReportsNarrativeInput = {
    rangeLabel: body.rangeLabel,
    totalCandidates: body.totalCandidates ?? 0,
    inflowTotal: body.inflowTotal ?? 0,
    inflowDeltaPct: body.inflowDeltaPct ?? null,
    topDomain: body.topDomain ?? null,
    topCategory: body.topCategory ?? null,
    topRecruiter: body.topRecruiter ?? null,
    totalPlaced: body.totalPlaced ?? 0,
    attentionSignals: body.attentionSignals ?? [],
  };

  const result = await generateReportsNarrative(input);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ narrative: result.narrative });
}
