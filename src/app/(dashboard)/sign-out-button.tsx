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
      className="text-slate-400 hover:text-white text-xs font-medium"
    >
      Sign out
    </button>
  );
}
