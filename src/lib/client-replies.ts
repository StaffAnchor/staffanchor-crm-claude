import type { SupabaseClient } from "@supabase/supabase-js";
import { rejectionReasonLabel } from "@/lib/mandate-stage";

// What employers did in the client portal: who signed in, who showed interest, asked for an interview or passed.
// Events are written by the portal's own database functions (see the client_portal_events migration).

export type ClientReply = {
  id: string;
  kind: "login" | "interested" | "interview_requested" | "not_interested";
  at: string;
  unseen: boolean;
  who: string;
  client: string | null;
  clientId: string;
  candidate: string | null;
  role: string | null;
  /** Interview time the employer asked for, pass reason, or note. */
  extra: string | null;
  href: string;
};

type Row = {
  id: string;
  kind: ClientReply["kind"];
  created_at: string;
  seen_at: string | null;
  user_email: string | null;
  client_id: string;
  mandate_id: string | null;
  detail: { candidate?: string; role?: string; client?: string; interview_at?: string; reason?: string; note?: string; first?: boolean } | null;
  clients: { name: string | null } | { name: string | null }[] | null;
};

const DAYS = 14;

const slot = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export async function loadClientReplies(
  supabase: SupabaseClient,
  opts: { days?: number; limit?: number; clientId?: string; kind?: string } = {}
): Promise<{ items: ClientReply[]; unseen: number }> {
  const since = new Date(Date.now() - (opts.days ?? DAYS) * 86_400_000).toISOString();
  let q = supabase
    .from("client_portal_events")
    .select("id, kind, created_at, seen_at, user_email, client_id, mandate_id, detail, clients(name)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 60);
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  if (opts.kind) q = q.eq("kind", opts.kind);
  const { data } = await q;

  const items: ClientReply[] = ((data ?? []) as unknown as Row[]).map((r) => {
    const d = r.detail ?? {};
    const client = (Array.isArray(r.clients) ? r.clients[0]?.name : r.clients?.name) ?? d.client ?? null;
    const extra =
      r.kind === "interview_requested" && d.interview_at ? `Asked for ${slot(d.interview_at)}`
      : r.kind === "not_interested" ? [d.reason ? rejectionReasonLabel("client_relayed", d.reason) : null, d.note].filter(Boolean).join(": ") || null
      : r.kind === "login" && d.first ? "First time signing in"
      : null;
    return {
      id: r.id,
      kind: r.kind,
      at: r.created_at,
      unseen: !r.seen_at,
      who: r.user_email ?? "Someone",
      client,
      clientId: r.client_id,
      candidate: d.candidate ?? null,
      role: d.role ?? null,
      extra,
      href: r.mandate_id ? `/mandates/${r.mandate_id}` : `/clients/${r.client_id}`,
    };
  });
  return { items, unseen: items.filter((i) => i.unseen).length };
}
