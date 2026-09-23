import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Edit or deactivate an existing slab. Deactivating (active:false) rather
// than deleting keeps history intact for any referral that already
// computed its payout off this slab.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  const update: Record<string, unknown> = {};
  if (body.ctcBandMin != null) update.ctc_band_min = Number(body.ctcBandMin);
  if ("ctcBandMax" in body) update.ctc_band_max = body.ctcBandMax != null && body.ctcBandMax !== "" ? Number(body.ctcBandMax) : null;
  if (body.payoutAmount != null) update.payout_amount = Number(body.payoutAmount);
  if (typeof body.active === "boolean") update.active = body.active;

  const { error } = await supabase.from("sales_circle_payout_slabs").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
