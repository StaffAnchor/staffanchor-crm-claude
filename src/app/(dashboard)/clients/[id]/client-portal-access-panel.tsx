"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Invite = { id: string; email: string; created_at: string; consumed_at: string | null };
type ClientUser = { id: string; email: string; full_name: string | null; created_at: string };

export default function ClientPortalAccessPanel({
  clientId,
  clientName,
  initialInvites,
  initialUsers,
}: {
  clientId: string;
  clientName: string;
  initialInvites: Invite[];
  initialUsers: ClientUser[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleInvite() {
    const trimmed = email.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    setSent(false);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error: insertError } = await supabase
        .from("client_invites")
        .insert({ client_id: clientId, email: trimmed, invited_by: user?.id ?? null });
      if (insertError) throw new Error(insertError.message);

      // The invite row above only grants access (checked by
      // get_or_create_my_client_user) -- it doesn't itself notify anyone.
      // Actually email them a sign-in link, same pattern as candidate invites.
      const res = await fetch("/api/send-client-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, email: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) {
        // Access was still granted -- just the email failed. Surface it so
        // the recruiter knows to tell the client manually instead of
        // assuming an email is on its way.
        throw new Error(json.error || "Access granted, but the invite email failed to send.");
      }

      setEmail("");
      setSent(true);
      router.refresh();
      setTimeout(() => setSent(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send invite.");
    } finally {
      setSending(false);
    }
  }

  const pendingInvites = initialInvites.filter((i) => !i.consumed_at);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900 mb-1">Client portal access</h2>
      <p className="text-xs text-slate-500 mb-4">
        Give someone at {clientName} a login to jobs.staffanchor.com/client-portal, where they can see every open
        role for {clientName} and review shortlists themselves — no separate link per mandate needed.
      </p>

      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="client.contact@company.com"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-500"
        />
        <button
          onClick={handleInvite}
          disabled={sending || !email.trim()}
          className="rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-medium px-3 py-2 whitespace-nowrap"
        >
          {sending ? "Sending…" : "Invite"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
      {sent && <p className="text-xs text-emerald-700 mt-1.5">Invite email sent — they can sign in with that email once it arrives.</p>}

      {(initialUsers.length > 0 || pendingInvites.length > 0) && (
        <div className="mt-4 border-t border-slate-100 pt-3 space-y-2">
          {initialUsers.map((u) => (
            <div key={u.id} className="flex items-center justify-between text-xs">
              <span className="text-slate-700">{u.email}</span>
              <span className="text-emerald-700 font-medium">Active</span>
            </div>
          ))}
          {pendingInvites.map((i) => (
            <div key={i.id} className="flex items-center justify-between text-xs">
              <span className="text-slate-700">{i.email}</span>
              <span className="text-amber-600 font-medium">Invited — not yet signed in</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
