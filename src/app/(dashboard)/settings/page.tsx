import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import OutreachPersonaForm from "./outreach-persona-form";

// A rep's own settings -- currently just their AI-outreach persona
// (outreach_sender_name / outreach_sender_bio, see generate-sales-outreach.ts).
// Every AI-drafted Sales message used to claim to be the founder ("16 years
// leading sales teams") regardless of who actually sent it; this lets each
// rep set their own name/credibility so drafts sound like them instead.
export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, outreach_sender_name, outreach_sender_bio")
    .eq("id", user.id)
    .single();

  return (
    <div className="max-w-xl mx-auto px-5 py-8">
      <h1 className="text-ros-display font-semibold tracking-tight text-slate-900 dark:text-slate-100 mb-1">Settings</h1>
      <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-4">
        {profile?.full_name ?? profile?.email ?? "Your account"}
      </p>

      <Card>
        <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 mb-1">AI outreach persona</p>
        <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-3">
          Used when generating Sales outreach drafts (LinkedIn DMs and cold emails) so the message sounds like you,
          not the founder, if you're the one sending it. Leave blank to keep the default founder voice.
        </p>
        <OutreachPersonaForm
          initialSenderName={profile?.outreach_sender_name ?? ""}
          initialSenderBio={profile?.outreach_sender_bio ?? ""}
        />
      </Card>
    </div>
  );
}
