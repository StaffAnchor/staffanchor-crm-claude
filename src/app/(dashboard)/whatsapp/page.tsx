import { createClient } from "@/lib/supabase/server";
import { groupConversations, type WaMessage } from "@/lib/whatsapp-threads";
import WhatsAppInbox from "./whatsapp-inbox";

// Everyone who has messaged the StaffAnchor WhatsApp number, newest first, with a
// reply box. Candidates who message first (from the "Message us on WhatsApp"
// buttons on the jobs site, website, emails and referrer portal) land here, even
// if their number is not in the candidate database yet.
export default async function WhatsAppPage() {
  const supabase = await createClient();
  const since = new Date(new Date().getTime() - 30 * 86_400_000).toISOString();
  const { data } = await supabase
    .from("whatsapp_messages")
    .select("id, created_at, candidate_id, direction, to_phone, body_preview, status, error, template_name")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000);

  const conversations = groupConversations((data ?? []) as WaMessage[], new Date().getTime());
  const ids = Array.from(new Set(conversations.map((c) => c.candidateId).filter((v): v is string => !!v)));
  const { data: cands } = ids.length ? await supabase.from("candidates").select("id, full_name").in("id", ids) : { data: [] };
  const names: Record<string, string> = {};
  for (const c of cands ?? []) names[c.id as string] = (c.full_name as string) ?? "";

  return (
    <div className="mx-auto max-w-[1300px] px-5 py-8">
      <div className="mb-5">
        <h1 className="text-ros-display font-semibold tracking-tight text-slate-900 dark:text-slate-100">WhatsApp</h1>
        <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">
          People who message StaffAnchor on WhatsApp, and your replies. You can reply freely for 24 hours after someone writes.
        </p>
      </div>
      <WhatsAppInbox conversations={conversations} names={names} />
    </div>
  );
}
