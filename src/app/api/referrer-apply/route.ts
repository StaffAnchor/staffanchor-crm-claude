import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

// Public, unauthenticated submission endpoint for Sales Circle referrer
// applications -- same class of route as api/vendor-apply/route.ts (no
// account exists yet, exempted in middleware.ts). Service-role client since
// there's no anon-key insert policy on sales_circle_referrers (writes go
// through this route and the admin approve/reject routes only).
function adminClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;
  return createSupabaseClient(supabaseUrl, serviceKey);
}

export async function POST(req: NextRequest) {
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const form = await req.formData();
  const fullName = String(form.get("fullName") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const linkedinUrl = String(form.get("linkedinUrl") ?? "").trim();
  const currentCompany = String(form.get("currentCompany") ?? "").trim();
  const designation = String(form.get("designation") ?? "").trim();
  const yearsOfExperience = form.get("yearsOfExperience");
  const city = String(form.get("city") ?? "").trim();
  const sectors = form.getAll("sectors").map(String).filter(Boolean);
  const tosAccepted = form.get("tosAccepted");

  if (!fullName || !email || !phone) {
    return NextResponse.json({ error: "Name, email, and phone are required." }, { status: 400 });
  }
  if (tosAccepted !== "true") {
    return NextResponse.json({ error: "Please accept the Terms & Conditions to continue." }, { status: 400 });
  }

  const yoeNum = Number(yearsOfExperience);
  const { error: insertError } = await admin.from("sales_circle_referrers").insert({
    full_name: fullName,
    email,
    phone,
    linkedin_url: linkedinUrl || null,
    current_company: currentCompany || null,
    designation: designation || null,
    years_of_experience: yearsOfExperience && !Number.isNaN(yoeNum) ? yoeNum : null,
    city: city || null,
    sectors,
    // Consent to the ToS is recorded at signup time (once the account is
    // actually created), not here -- this checkbox just gates the
    // application form itself; tos_version/tos_accepted_at get set in
    // api/referrer-signup/[token]/route.ts.
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
