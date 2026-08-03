import { NextRequest } from "next/server";
import { corsJson, corsPreflight, requireExtensionUser } from "@/lib/extension-auth";

export const runtime = "nodejs";

// Called by the Chrome extension's content script right before it offers to
// save a scraped LinkedIn profile, so a recruiter sees "already in
// StaffAnchor -- owned by X" instead of quietly creating a second row for
// someone already in the system. Matches by linkedin_url (the one stable
// key a scraped profile always has, unlike email/phone which LinkedIn
// rarely exposes).
export async function OPTIONS() {
  return corsPreflight();
}

export async function GET(req: NextRequest) {
  const auth = await requireExtensionUser(req);
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  const linkedinUrl = req.nextUrl.searchParams.get("linkedin_url")?.trim();
  if (!linkedinUrl) {
    return corsJson({ error: "linkedin_url is required." }, { status: 400 });
  }

  const { data: existing } = await admin
    .from("candidates")
    .select("id, full_name, status, owner_id")
    .eq("linkedin_url", linkedinUrl)
    .maybeSingle();

  if (!existing) {
    return corsJson({ exists: false });
  }

  // Separate lookup rather than an embedded join -- candidates has more
  // than one FK into profiles (owner_id, created_by_user), which makes
  // Supabase's embedded-select alias syntax ambiguous about which
  // relationship to follow.
  let ownerName: string | null = null;
  if (existing.owner_id) {
    const { data: ownerProfile } = await admin.from("profiles").select("full_name, email").eq("id", existing.owner_id).maybeSingle();
    ownerName = ownerProfile?.full_name ?? ownerProfile?.email ?? null;
  }

  return corsJson({
    exists: true,
    candidateId: existing.id,
    fullName: existing.full_name,
    status: existing.status,
    ownerName,
  });
}
