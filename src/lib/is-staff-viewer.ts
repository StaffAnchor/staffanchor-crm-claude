import { createClient } from "@/lib/supabase/server";

// Lets a signed-in admin/recruiter open a no-login client shortlist link
// (or its Sales Passport sub-page) without going through the client's
// email-OTP gate -- so they can eyeball exactly what the client will see
// before sending the link out. This never grants a client-side visitor
// anything: it only fires when a real Supabase Auth session cookie for a
// staff account is present, which a client opening the link never has.
// The OTP gate itself (see shortlist-auth.ts) is untouched -- this is a
// second, independent way in, not a change to how clients get access.
export async function isStaffPreview(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    return !!profile && ["admin", "recruiter"].includes(profile.role);
  } catch {
    // Any failure (no session, RLS denial, etc.) just falls back to the
    // normal client-facing OTP gate -- never fails open.
    return false;
  }
}
