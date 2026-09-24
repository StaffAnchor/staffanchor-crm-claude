import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

// Public, token-gated route -- same class as api/vendor-signup/[token]. The
// invite_token on sales_circle_referrers, checked server-side here, is the
// only credential; there's no staff session at this point.
const TOS_VERSION = "2026-09-v1";

function adminClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;
  return createSupabaseClient(supabaseUrl, serviceKey);
}

async function loadValidReferrer(admin: SupabaseClient, token: string) {
  const { data: referrer } = await admin
    .from("sales_circle_referrers")
    .select("id, full_name, email, status, invite_token_expires_at")
    .eq("invite_token", token)
    .maybeSingle();
  if (!referrer) return { referrer: null, reason: "This invite link isn't valid." };
  if (referrer.status !== "approved") {
    return { referrer: null, reason: "This invite has already been used." };
  }
  if (referrer.invite_token_expires_at && new Date(referrer.invite_token_expires_at).getTime() < Date.now()) {
    return { referrer: null, reason: "This invite link has expired. Reach out to StaffAnchor for a new one." };
  }
  return { referrer, reason: null as string | null };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const { referrer, reason } = await loadValidReferrer(admin, token);
  if (!referrer) return NextResponse.json({ error: reason }, { status: 404 });

  return NextResponse.json({ ok: true, fullName: referrer.full_name, email: referrer.email });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const { referrer, reason } = await loadValidReferrer(admin, token);
  if (!referrer) return NextResponse.json({ error: reason }, { status: 404 });

  const { password } = await req.json();
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const { data: existingProfile } = await admin.from("profiles").select("id").eq("email", referrer.email).maybeSingle();
  if (existingProfile) {
    return NextResponse.json({ error: "An account with this email already exists. Try signing in instead." }, { status: 409 });
  }

  // A person can already have a Supabase Auth account under this email
  // without having a `profiles` row -- most commonly because they're an
  // existing candidate (candidates.user_id links to auth.users directly,
  // bypassing `profiles` entirely; see jobs.staffanchor.com's candidate
  // portal). Supabase Auth enforces one auth.users row per email
  // project-wide, so a plain createUser() call fails for them with
  // "already been registered" even though, from the referral program's
  // point of view, they have no account yet. Being a candidate should never
  // block someone from also becoming a referrer, so: try to create a new
  // auth user first (the common case), and only if that fails specifically
  // because the email is taken, look up the existing auth user, reset their
  // password to the one just chosen here (so this referrer signup flow
  // actually leaves them with working credentials), and attach the new
  // `profiles` row to that same auth id instead of creating a second one --
  // Supabase Auth has no concept of "one email, two accounts", so reusing
  // the identity is the only way to give this email both a candidate record
  // and a referrer profile.
  let authUserId: string;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: referrer.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: referrer.full_name },
  });

  if (created?.user) {
    authUserId = created.user.id;
  } else if (createError && /already.*registered|email.*exists|email_exists/i.test(createError.message ?? "")) {
    let existingAuthUserId: string | null = null;
    let page = 1;
    while (!existingAuthUserId) {
      const { data: pageData, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (listError || !pageData?.users?.length) break;
      const match = pageData.users.find((u) => u.email?.toLowerCase() === referrer.email.toLowerCase());
      if (match) {
        existingAuthUserId = match.id;
        break;
      }
      if (pageData.users.length < 1000) break;
      page += 1;
    }
    if (!existingAuthUserId) {
      return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
    }
    const { error: updateError } = await admin.auth.admin.updateUserById(existingAuthUserId, {
      password,
      email_confirm: true,
      user_metadata: { full_name: referrer.full_name },
    });
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    authUserId = existingAuthUserId;
  } else {
    return NextResponse.json({ error: createError?.message ?? "Failed to create account" }, { status: 500 });
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: authUserId,
    full_name: referrer.full_name,
    email: referrer.email,
    role: "referrer",
    sales_circle_referrer_id: referrer.id,
  });
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  // Consume the token, and record the T&C acceptance -- version + timestamp,
  // per the spec's DPDP-consciousness. This is the actual "acceptance"
  // moment (the checkbox on the application form just gated getting this
  // far), since it's the point a real account is being created.
  await admin
    .from("sales_circle_referrers")
    .update({
      invite_token: null,
      invite_token_expires_at: null,
      tos_version: TOS_VERSION,
      tos_accepted_at: new Date().toISOString(),
    })
    .eq("id", referrer.id);

  return NextResponse.json({ ok: true });
}
