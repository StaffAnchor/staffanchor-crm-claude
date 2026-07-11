import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import VendorNav from "./vendor-nav";

// Vendor/freelancer portal shell -- a deliberately separate, minimal
// experience from the internal (dashboard) CRM (see also the middleware
// redirect that keeps freelancers here and staff out). RLS + the vendor_*
// RPCs already restrict the underlying data to each freelancer's own
// assigned mandates and submissions, but this separate shell also means
// they never see internal-only nav (Clients, Reports, Team, etc.) that
// wouldn't apply to them anyway.
export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "freelancer") redirect("/inbox");

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <VendorNav fullName={profile?.full_name ?? null} email={profile?.email ?? user.email ?? ""} />
      {children}
    </div>
  );
}
