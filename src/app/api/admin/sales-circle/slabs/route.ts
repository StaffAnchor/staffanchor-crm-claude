import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Create a new CTC-band payout slab. ctcBandMax may be null (open-ended top
// band). Admin-only -- payout economics, not a recruiter/partner call.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Only admins can manage payout slabs" }, { status: 403 });
  }

  const body = await req.json();
  const ctcBandMin = Number(body.ctcBandMin);
  const ctcBandMax = body.ctcBandMax != null && body.ctcBandMax !== "" ? Number(body.ctcBandMax) : null;
  const payoutAmount = Number(body.payoutAmount);
  if (!Number.isFinite(ctcBandMin) || !Number.isFinite(payoutAmount)) {
    return NextResponse.json({ error: "Invalid slab values" }, { status: 400 });
  }

  const { error } = await supabase.from("sales_circle_payout_slabs").insert({
    ctc_band_min: ctcBandMin,
    ctc_band_max: ctcBandMax,
    payout_amount: payoutAmount,
    active: true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
