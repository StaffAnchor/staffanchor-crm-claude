import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { reason } = await req.json().catch(() => ({ reason: null }));

  const { data: referrer } = await supabase.from("sales_circle_referrers").select("id, status").eq("id", id).single();
  if (!referrer) return NextResponse.json({ error: "Referrer not found" }, { status: 404 });
  if (referrer.status !== "applied") {
    return NextResponse.json({ error: "This application has already been reviewed" }, { status: 409 });
  }

  const { error: updateError } = await supabase
    .from("sales_circle_referrers")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason ?? null,
    })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
