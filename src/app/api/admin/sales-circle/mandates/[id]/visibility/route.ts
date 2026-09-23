import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Toggle whether a mandate appears on the referrer blind-brief board, and
// whether Trusted-tier referrers see the client company name for it. This
// is the single on/off switch referenced in roles/page.tsx.
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

  const body = await req.json();
  const update: Record<string, unknown> = {};
  if (typeof body.referralVisible === "boolean") update.referral_visible = body.referralVisible;
  if (typeof body.revealCompany === "boolean") update.referral_reveal_company_to_trusted = body.revealCompany;

  const { error } = await supabase.from("mandates").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
