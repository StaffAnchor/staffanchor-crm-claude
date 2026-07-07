"use client";

import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.assign("/login");
  }

  return (
    <button
      onClick={handleSignOut}
      className="text-[13px] text-slate-600 hover:text-slate-900 font-medium"
    >
      Sign out
    </button>
  );
}
