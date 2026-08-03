import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

// Public, token-gated route (no staff session exists at this point) --
// same class of self-authorizing route as the shortlist-link and
// interview-scheduling links (see middleware.ts isPublicRoute). The token
// itself, checked against vendor_agencies.invite_token/expiry, is the only
// credential; there's nothing else to leak by exposing agency name/contact
// email back to whoever holds a valid link.
function adminClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;
  return createSupabaseClient(supabaseUrl, serviceKey);
}

async function loadValidAgency(admin: SupabaseClient, token: string) {
  const { data: agency } = await admin
    .from("vendor_agencies")
    .select("id, name, contact_email, status, invite_token_expires_at")
    .eq("invite_token", token)
    .maybeSingle();
  if (!agency) return { agency: null, reason: "This invite link isn't valid." };
  if (agency.status !== "invited") {
    return { agency: null, reason: "This invite has already been used." };
  }
  if (agency.invite_token_expires_at && new Date(agency.invite_token_expires_at).getTime() < Date.now()) {
    return { agency: null, reason: "This invite link has expired. Ask your StaffAnchor contact for a new one." };
  }
  return { agency, reason: null as string | null };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const { agency, reason } = await loadValidAgency(admin, token);
  if (!agency) return NextResponse.json({ error: reason }, { status: 404 });

  return NextResponse.json({ ok: true, agencyName: agency.name, contactEmail: agency.contact_email });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const { agency, reason } = await loadValidAgency(admin, token);
  if (!agency) return NextResponse.json({ error: reason }, { status: 404 });

  const { fullName, email, password } = await req.json();
  if (!fullName || !email || !password) {
    return NextResponse.json({ error: "fullName, email, and password are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists. Try signing in instead." }, { status: 409 });
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created?.user) {
    return NextResponse.json({ error: createError?.message ?? "Failed to create account" }, { status: 500 });
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    full_name: fullName,
    email,
    role: "freelancer",
    vendor_agency_id: agency.id,
  });
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  // Consume the token -- it's a one-time signup link for the agency's first
  // recruiter; the admin adds any additional recruiters at that agency from
  // the Vendors page (assigns them to the same vendor_agency_id) rather than
  // this same link being reusable indefinitely.
  await admin
    .from("vendor_agencies")
    .update({ status: "active", activated_at: new Date().toISOString(), invite_token: null })
    .eq("id", agency.id);

  return NextResponse.json({ ok: true });
}
