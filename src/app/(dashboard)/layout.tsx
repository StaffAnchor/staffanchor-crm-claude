import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold text-slate-900">
              StaffAnchor <span className="text-blue-600">CRM</span>
            </span>
            <nav className="flex items-center gap-4 text-sm text-slate-600">
              <Link href="/candidates" className="hover:text-slate-900">
                Candidates
              </Link>
              <Link href="/mandates" className="hover:text-slate-900">
                Mandates
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span>
              {profile?.full_name ?? profile?.email}{" "}
              <span className="text-slate-400">({profile?.role})</span>
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
