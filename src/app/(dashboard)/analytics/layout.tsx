import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AnalyticsSubNav from "./analytics-sub-nav";

// Consolidation pass: Reports, Billing, and FY Targets were three separate
// nav items, each firm-wide/decision-making data with no working use for a
// recruiter's day-to-day (unlike Candidates/Mandates/Sales, which every
// recruiter touches directly). Folded into one "Analytics" tab, gated
// admin-only, so the top nav isn't cluttered with pages 90% of the team
// never needed to open -- an admin can still screenshot/share a specific
// number with a recruiter when it's relevant, per the ask. Team and
// Vendors stay separate: those are admin CRUD tools (managing people/vendor
// accounts), not performance metrics, so they don't belong under Analytics.
//
// Defense-in-depth admin gate, same pattern as team/page.tsx and the old
// targets/page.tsx: (1) nav link only rendered for role === "admin" in
// (dashboard)/layout.tsx, (2) this explicit redirect, (3) RLS on the
// underlying tables. Applied once here at the layout level so Reports and
// Billing -- which previously only had layer (1) -- now get the same
// protection Targets already had.
export default async function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: myProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (myProfile?.role !== "admin") {
    redirect("/candidates");
  }

  return (
    <div>
      {/* Slim sub-nav strip, full-width like the app's own TopNav, sitting
          just below it. Each child page keeps its own max-w container/
          padding (unchanged from before the move), so this only adds the
          tab strip -- no nested-padding surprises. */}
      <div className="border-b border-slate-100 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40">
        <div className="max-w-[1500px] mx-auto px-5 pt-5">
          <h1 className="text-ros-display font-semibold tracking-tight text-slate-900 dark:text-slate-100">Analytics</h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1 mb-4">
            Recruiter productivity, billing, and target performance — everything used for a decision, in one place.
            Admin-only; share specific numbers with recruiters as needed.
          </p>
          <AnalyticsSubNav />
        </div>
      </div>
      {children}
    </div>
  );
}
