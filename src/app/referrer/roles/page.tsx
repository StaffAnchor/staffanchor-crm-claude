import { CircleDollarSign, Handshake, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { RoleCardData } from "@/lib/sales-circle";
import RolesBoard from "./roles-board";

// Roles a referrer can refer against. Everything comes from the
// referrer_open_roles() database function: a fixed, blind-safe set of fields.
// The client company name is included there only for Trusted referrers on
// roles an admin has marked "reveal"; for everyone else it is not sent at all,
// so it cannot be read from this page or from the network.
export default async function ReferrerRolesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("referrer_open_roles");
  const roles = ((data ?? []) as RoleCardData[]).filter((r) => r && r.id);

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-8">
      <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Open roles</h1>
      <p className="mt-1 text-[14px] text-slate-500">
        Real sales roles from StaffAnchor&apos;s clients. The company name stays confidential. Everything else is here, so you can tell at a glance who in
        your network fits.
      </p>

      <ol className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          { icon: Handshake, title: "Pick a role", text: "Match it to someone you know and trust." },
          { icon: UserPlus, title: "Refer them", text: "Share their details. We screen and take it from there." },
          { icon: CircleDollarSign, title: "Get paid", text: "Paid after they join, complete 90 days and the client's payment reaches us." },
        ].map((s, i) => (
          <li key={s.title} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
              <s.icon className="h-4 w-4" />
            </span>
            <div>
              <div className="text-[13px] font-semibold text-slate-900">
                {i + 1}. {s.title}
              </div>
              <div className="text-[12px] leading-snug text-slate-500">{s.text}</div>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-7">
        {error ? (
          <p className="text-sm text-rose-600">We couldn&apos;t load the roles just now. Please refresh in a moment.</p>
        ) : roles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <p className="text-[15px] font-medium text-slate-700">No open roles right now</p>
            <p className="mt-1 text-[13px] text-slate-400">New roles are added regularly. Check back soon.</p>
          </div>
        ) : (
          <RolesBoard roles={roles} />
        )}
      </div>
    </div>
  );
}
