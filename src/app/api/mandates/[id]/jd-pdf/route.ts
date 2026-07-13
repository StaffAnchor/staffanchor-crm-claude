import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderJdPdf, clientDisplayName, type JdPdfMandate } from "@/lib/generate-jd-pdf";

// Downloadable JD document for a single mandate -- generated on demand so it
// always reflects the current JD fields (no stale cached file to keep in
// sync). A recruiter downloads this from the mandate page and can then
// forward it however they like -- WhatsApp, personal email, print -- which
// is what makes it usable for candidates who aren't in our database at all,
// not just the "email it to a linked candidate" flow (see
// /api/mandates/[id]/email-jd for that one).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: mandate, error } = await supabase
    .from("mandates")
    .select(
      "role_title, client_name, show_client_name, public_client_label, category, sub_domain, sub_domains, city, cities, budget_min, budget_max, experience_min, experience_max, work_mode, jd_overview, jd_responsibilities, jd_candidate_profile, jd_compensation_benefits, must_haves, good_to_haves"
    )
    .eq("id", id)
    .single();

  if (error || !mandate) {
    return NextResponse.json({ error: "Mandate not found" }, { status: 404 });
  }

  const pdfBuffer = await renderJdPdf(mandate as JdPdfMandate);
  const clientDisplay = clientDisplayName(mandate);
  const fileNameSafe = `JD-${mandate.role_title}-${clientDisplay}`
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileNameSafe}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
