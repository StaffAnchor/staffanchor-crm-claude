import { createClient } from "@/lib/supabase/server";
import { missingKeyDetails } from "@/lib/key-details";
import { draftMissingMessage } from "@/lib/missing-message";
import { groupConversations, type WaMessage } from "@/lib/whatsapp-threads";
import { introducedName } from "@/lib/whatsapp-bot/identity";
import WhatsAppInbox, { type ContactInfo } from "./whatsapp-inbox";

// Everyone who has messaged the StaffAnchor WhatsApp number, newest first, with a
// reply box. Candidates who message first (from the "Message us on WhatsApp"
// buttons on the jobs site, website, emails and referrer portal) land here, even
// if their number is not in the candidate database yet.
export default async function WhatsAppPage() {
  const supabase = await createClient();
  const since = new Date(new Date().getTime() - 30 * 86_400_000).toISOString();
  const { data } = await supabase
    .from("whatsapp_messages")
    .select("id, created_at, candidate_id, direction, to_phone, body_preview, status, error, template_name, media_path, media_name")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000);

  const conversations = groupConversations((data ?? []) as WaMessage[], new Date().getTime());
  const ids = Array.from(new Set(conversations.map((c) => c.candidateId).filter((v): v is string => !!v)));
  const { data: cands } = ids.length
    ? await supabase.from("candidates").select("id, full_name, current_job_title, current_employer, total_experience_years, current_fixed_ctc, expected_fixed_ctc, notice_period, current_location, resume_file_url").in("id", ids)
    : { data: [] };
  const names: Record<string, string> = {};
  const missing: Record<string, string[]> = {};
  const drafts: Record<string, string> = {};
  for (const c of cands ?? []) {
    names[c.id as string] = (c.full_name as string) ?? "";
    missing[c.id as string] = missingKeyDetails(c).map((m) => m.label);
    const d = draftMissingMessage(c.full_name as string | null, c, !!c.resume_file_url);
    if (d) drafts[c.id as string] = d;
  }

  // A chat from a number that is not on any profile, where the person said a name that matches exactly one
  // profile: suggest it, for a recruiter to confirm. Never linked automatically.
  const suggestions: Record<string, { candidateId: string; name: string; phone: string | null }> = {};
  const unlinked = conversations.filter((c) => !c.candidateId);
  const nameByChat = new Map<string, string>();
  for (const c of unlinked) {
    const lastIntro = [...c.messages].reverse().find((m) => m.direction === "inbound" && introducedName(m.body_preview));
    const n = lastIntro ? introducedName(lastIntro.body_preview) : null;
    if (n) nameByChat.set(c.key, n);
  }
  const wanted = Array.from(new Set(Array.from(nameByChat.values()).map((n) => n.replace(/[%_,()]/g, ""))));
  if (wanted.length) {
    const { data: hits } = await supabase
      .from("candidates")
      .select("id, full_name, phone")
      .or(wanted.map((n) => `full_name.ilike.${n}`).join(","))
      .limit(200);
    const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
    for (const [chatKey, n] of nameByChat) {
      const matches = (hits ?? []).filter((h) => norm((h.full_name as string) ?? "") === norm(n));
      if (matches.length === 1) suggestions[chatKey] = { candidateId: matches[0].id as string, name: matches[0].full_name as string, phone: (matches[0].phone as string | null) ?? null };
    }
  }

  const { data: contactRows } = await supabase
    .from("whatsapp_contacts")
    .select("phone_key, kind, archived_at, muted, bot_paused, needs_human, needs_human_reason, opted_out, bot_state, display_name");
  const contacts: Record<string, ContactInfo> = {};
  for (const r of contactRows ?? []) {
    const st = (r.bot_state ?? {}) as { status?: string; step?: string };
    contacts[r.phone_key as string] = {
      kind: r.kind as ContactInfo["kind"],
      archived: !!r.archived_at,
      muted: !!r.muted,
      botPaused: !!r.bot_paused,
      needsHuman: !!r.needs_human,
      reason: (r.needs_human_reason as string | null) ?? null,
      optedOut: !!r.opted_out,
      botStatus: st.status ?? null,
      botStep: st.step ?? null,
      displayName: (r.display_name as string | null) ?? null,
    };
  }

  return (
    <div className="mx-auto max-w-[1300px] px-5 py-8">
      <div className="mb-5">
        <h1 className="ros-page-title">WhatsApp</h1>
        <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">
          Every WhatsApp conversation, sorted by what needs you. You can reply freely for 24 hours after someone writes.
        </p>
      </div>
      <WhatsAppInbox conversations={conversations} names={names} contacts={contacts} missing={missing} drafts={drafts} suggestions={suggestions} />
    </div>
  );
}
