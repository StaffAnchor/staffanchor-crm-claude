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

// Looks up an existing login for this email (a candidate from the jobs site,
// for instance). Email can only belong to one login project-wide, so a person
// who is already a candidate has to be given the referrer role on that same
// login rather than a second one.
async function findAuthUserByEmail(admin: SupabaseClient, email: string): Promise<{ id: string } | null> {
  const wanted = email.toLowerCase();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) return null;
    const match = data.users.find((u) => u.email?.toLowerCase() === wanted);
    if (match) return { id: match.id };
    if (data.users.length < 1000) return null;
  }
  return null;
}

const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const { referrer, reason } = await loadValidReferrer(admin, token);
  if (!referrer) return NextResponse.json({ error: reason }, { status: 404 });

  // Tells the page whether to ask for a new password or to add Sales Circle to
  // an account this person already has.
  const existing = await findAuthUserByEmail(admin, referrer.email);
  return NextResponse.json({ ok: true, fullName: referrer.full_name, email: referrer.email, existingAccount: !!existing });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const { referrer, reason } = await loadValidReferrer(admin, token);
  if (!referrer) return NextResponse.json({ error: reason }, { status: 404 });

  const { password } = await req.json().catch(() => ({ password: undefined }));

  // A team, vendor or referrer profile that already uses this email means this
  // is not a new person. Stop before touching any account. Case-insensitive.
  const { data: existingProfile } = await admin.from("profiles").select("id").ilike("email", escapeLike(referrer.email)).maybeSingle();
  if (existingProfile) {
    return NextResponse.json({ error: "An account with this email already exists. Try signing in instead." }, { status: 409 });
  }

  const existingAuth = await findAuthUserByEmail(admin, referrer.email);
  let authUserId: string;
  let createdNewLogin = false;

  if (existingAuth) {
    // Already has a login (usually a candidate). Their password is NOT changed;
    // they keep signing in the way they already do. A profile by id can still
    // exist if its email was stored differently, so check that too.
    const { data: profileById } = await admin.from("profiles").select("id").eq("id", existingAuth.id).maybeSingle();
    if (profileById) {
      return NextResponse.json({ error: "An account with this email already exists. Try signing in instead." }, { status: 409 });
    }
    authUserId = existingAuth.id;
  } else {
    if (!password || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: referrer.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: referrer.full_name },
    });
    if (!created?.user) {
      return NextResponse.json({ error: createError?.message ?? "Failed to create account" }, { status: 500 });
    }
    authUserId = created.user.id;
    createdNewLogin = true;
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: authUserId,
    full_name: referrer.full_name,
    email: referrer.email,
    role: "referrer",
    sales_circle_referrer_id: referrer.id,
  });
  if (profileError) {
    // Don't leave a half-made login behind. Only ever remove one made here.
    if (createdNewLogin) {
      try {
        await admin.auth.admin.deleteUser(authUserId);
      } catch (cleanupError) {
        console.error("Referrer signup: could not remove the half-made login", authUserId, cleanupError);
      }
    }
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  // Consume the token and record the T&C acceptance (version + timestamp, per
  // the spec's DPDP-consciousness): this is the moment a real account exists.
  await admin
    .from("sales_circle_referrers")
    .update({
      invite_token: null,
      invite_token_expires_at: null,
      tos_version: TOS_VERSION,
      tos_accepted_at: new Date().toISOString(),
    })
    .eq("id", referrer.id);

  return NextResponse.json({ ok: true, existingAccount: !createdNewLogin });
}
