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
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Only admins can reject vendor applications" }, { status: 403 });
  }

  const { rejectionReason } = await req.json().catch(() => ({ rejectionReason: null }));

  const { data: application } = await supabase.from("vendor_applications").select("status").eq("id", id).single();
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  if (application.status !== "applied") {
    return NextResponse.json({ error: "This application has already been reviewed" }, { status: 409 });
  }

  const { error } = await supabase
    .from("vendor_applications")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: rejectionReason ?? null,
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
