import { createClient } from "@supabase/supabase-js";
import SlotPicker from "./slot-picker";

type OptionRow = {
  link_id: string;
  candidate_name: string;
  role_title: string;
  client_name: string;
  already_confirmed_at: string | null;
  slot_id: string | null;
  slot_starts_at: string | null;
  slot_duration_minutes: number | null;
};

// No-login candidate scheduling page -- mirrors the shortlist/[token] page's
// anon-client + RPC pattern exactly (see src/app/shortlist/[token]/page.tsx).
// A recruiter generates one of these links per candidate_mandate_links row
// from the Interviews page ("Let candidate pick"), after defining a few
// interview_slots; this page lets the candidate book one without an
// account, writing candidate_mandate_links.confirmed_interview_at via the
// book_interview_slot() RPC.
export default async function ScheduleInterviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase.rpc("get_interview_scheduling_options", {
    p_token: token,
  });

  if (error || !data || data.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md text-center">
          <p className="text-sm font-semibold text-slate-900">
            {error ? error.message : "This scheduling link isn't valid."}
          </p>
          <p className="text-sm text-slate-500 mt-1">Please reach out to your StaffAnchor recruiter for a new link.</p>
        </div>
      </div>
    );
  }

  const rows = data as OptionRow[];
  const { candidate_name, role_title, client_name, already_confirmed_at } = rows[0];
  const slots = rows
    .filter((r): r is OptionRow & { slot_id: string; slot_starts_at: string } => r.slot_id !== null && r.slot_starts_at !== null)
    .map((r) => ({ id: r.slot_id, startsAt: r.slot_starts_at, durationMinutes: r.slot_duration_minutes ?? 30 }));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-xl mx-auto px-6 py-6">
          <p className="text-xs font-semibold tracking-wide text-blue-600 uppercase">StaffAnchor Talent Solutions</p>
          <h1 className="text-xl font-semibold text-slate-900 mt-1">
            Schedule your interview — {role_title}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Hi {candidate_name.split(" ")[0]}, {client_name} would like to interview you. Pick a time that works below.
          </p>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-6 py-8">
        <SlotPicker
          token={token}
          slots={slots}
          alreadyConfirmedAt={already_confirmed_at}
          clientName={client_name}
        />
      </main>
    </div>
  );
}
