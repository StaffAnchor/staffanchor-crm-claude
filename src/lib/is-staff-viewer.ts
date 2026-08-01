import { createClient } from "@/lib/supabase/server";

// Central list of roles that can use the internal CRM (as opposed to
// "freelancer", which is vendor-portal-only). Import this instead of
// re-typing ["admin", "recruiter"] / ["admin", "recruiter", "partner"] --
// a role list that's been copy-pasted across ~15 files is exactly the kind
// of thing that silently drifts when a new role like "partner" is added.
export const CRM_STAFF_ROLES = ["admin", "recruiter", "partner"] as const;

// Lets a signed-in admin/recruiter open a no-login client shortlist link
// (or its Sales Passport sub-page) without going through the client's
// email-OTP gate -- so they can eyeball exactly what the client will see
// before sending the link out. This never grants a client-side visitor
// anything: it only fires when a real Supabase Auth session cookie for a
// staff account is present, which a client opening the link never has.
// The OTP gate itself (see shortlist-auth.ts) is untouched -- this is a
// second, independent way in, not a change to how clients get access.
//
// Returns the viewer's actual role (so the banner can say "Recruiter
// preview" / "Partner preview" / "Admin preview" instead of always saying
// "Admin" regardless of who's actually bypassing the gate), or null if this
// isn't a staff preview at all.
export async function getStaffPreviewRole(): Promise<(typeof CRM_STAFF_ROLES)[number] | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (!profile || !(CRM_STAFF_ROLES as readonly string[]).includes(profile.role)) return null;
    return profile.role as (typeof CRM_STAFF_ROLES)[number];
  } catch {
    // Any failure (no session, RLS denial, etc.) just falls back to the
    // normal client-facing OTP gate -- never fails open.
    return null;
  }
}

// Back-compat boolean wrapper -- kept for any call site that only needs the
// yes/no check, not the role itself.
export async function isStaffPreview(): Promise<boolean> {
  return (await getStaffPreviewRole()) !== null;
}
