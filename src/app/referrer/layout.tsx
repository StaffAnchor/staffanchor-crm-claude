import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ReferrerNav from "./referrer-nav";

// Sales Circle referrer portal shell -- deliberately separate from both the
// internal (dashboard) CRM and the vendor/ portal (see also the middleware
// redirect that keeps referrers here and everyone else out). RLS on the
// sales_circle_* tables already restricts data to each referrer's own rows
// via profiles.sales_circle_referrer_id, but this separate shell also means
// referrers never see internal-only nav that wouldn't apply to them anyway.
export default async function ReferrerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role, sales_circle_referrer_id")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "referrer") redirect("/inbox");

  const { data: referrer } = profile.sales_circle_referrer_id
    ? await supabase.from("sales_circle_referrers").select("tier").eq("id", profile.sales_circle_referrer_id).single()
    : { data: null };

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <ReferrerNav
        fullName={profile?.full_name ?? null}
        email={profile?.email ?? user.email ?? ""}
        tier={referrer?.tier ?? "member"}
      />
      {children}
    </div>
  );
}
