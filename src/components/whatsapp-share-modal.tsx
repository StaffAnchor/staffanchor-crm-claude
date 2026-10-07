"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, MessageCircle, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { WHATSAPP_TARGET, firstNameOf, whatsappLink } from "@/lib/whatsapp-link";

const JOBS_SITE = process.env.NEXT_PUBLIC_JOBS_SITE_URL ?? "https://jobs.staffanchor.com";

type Recipient = { id: string; full_name: string; phone: string | null };
type OpenMandate = {
  id: string;
  role_title: string;
  client_name: string | null;
  city: string | null;
  budget_min: number | null;
  budget_max: number | null;
  work_mode: string | null;
  short_code: string | null;
};

const lakh = (n: number) => `${Number(n)}`;
function ctcText(min: number | null, max: number | null) {
  if (min && max) return `₹${lakh(min)}-${lakh(max)} LPA`;
  if (max) return `up to ₹${lakh(max)} LPA`;
  if (min) return `from ₹${lakh(min)} LPA`;
  return null;
}

// Pick an opportunity (or none), see the message it produces, then send it to
// each selected candidate. WhatsApp links open one chat at a time, so the
// list below is a one-click-per-person queue: each name opens its own chat
// with the message already typed, and gets a tick once clicked.
export default function WhatsAppShareModal({
  candidateIds,
  defaultMandateId,
  onClose,
}: {
  candidateIds: string[];
  defaultMandateId?: string;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [mandates, setMandates] = useState<OpenMandate[]>([]);
  const [sender, setSender] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mandateId, setMandateId] = useState(defaultMandateId ?? "");
  const [withCompany, setWithCompany] = useState(false);
  const [withCtc, setWithCtc] = useState(true);
  const [withLink, setWithLink] = useState(true);
  const [custom, setCustom] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const [prof, cands, mands] = await Promise.all([
        user ? supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from("candidates").select("id, full_name, phone").in("id", candidateIds),
        supabase
          .from("mandates")
          .select("id, role_title, client_name, city, budget_min, budget_max, work_mode, short_code")
          .eq("status", "open")
          .order("created_at", { ascending: false }),
      ]);
      if (!alive) return;
      setUserId(user?.id ?? null);
      setSender(prof.data?.full_name ? firstNameOf(prof.data.full_name) : null);
      const order = new Map(candidateIds.map((id, i) => [id, i]));
      setRecipients(((cands.data ?? []) as Recipient[]).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)));
      setMandates((mands.data ?? []) as OpenMandate[]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [supabase, candidateIds]);

  const mandate = mandates.find((m) => m.id === mandateId) ?? null;

  const suggested = useMemo(() => {
    const intro = `Hi {name}, this is ${sender ? `${sender} from StaffAnchor` : "StaffAnchor"}.`;
    if (!mandate) {
      return `${intro} I came across your profile and have an opportunity I'd like to discuss. Do you have 5 minutes for a quick call today?`;
    }
    const where = [mandate.city, mandate.work_mode].filter(Boolean).join(", ");
    const ctc = withCtc ? ctcText(mandate.budget_min, mandate.budget_max) : null;
    const link = withLink && mandate.short_code ? ` Details: ${JOBS_SITE}/j/${mandate.short_code}` : "";
    return (
      `${intro} We have an opening for ${mandate.role_title}` +
      `${withCompany && mandate.client_name ? ` at ${mandate.client_name}` : ""}` +
      `${where ? ` in ${where}` : ""}${ctc ? `, with a CTC of ${ctc}` : ""}.` +
      ` Would this interest you? If yes, please reply here and we can set up a quick call.${link}`
    );
  }, [mandate, sender, withCompany, withCtc, withLink]);

  const message = custom ?? suggested;

  function markSent(r: Recipient) {
    setSent((prev) => new Set(prev).add(r.id));
    // The query builder only sends once awaited/then'd, so this .then() is what actually fires the insert.
    supabase
      .from("activities")
      .insert({
        actor_id: userId,
        entity_type: "candidate",
        entity_id: r.id,
        kind: "whatsapp",
        metadata: mandate ? { mandate_id: mandate.id, mandate_title: mandate.role_title, template: "opportunity" } : { template: "intro" },
      })
      .then(() => {});
  }

  const withPhone = recipients.filter((r) => whatsappLink(r.phone, "x"));
  const allDone = withPhone.length > 0 && withPhone.every((r) => sent.has(r.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-xl bg-white shadow-xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold text-slate-900 dark:text-slate-100">
            <MessageCircle className="h-4 w-4 text-emerald-600" />
            Share an opportunity on WhatsApp
            <span className="text-[12px] font-normal text-slate-400">
              {candidateIds.length} candidate{candidateIds.length === 1 ? "" : "s"}
            </span>
          </h3>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label className="mb-1 block text-[12px] font-medium text-slate-600 dark:text-slate-300">Which opportunity?</label>
            <select
              value={mandateId}
              onChange={(e) => {
                setMandateId(e.target.value);
                setCustom(null);
              }}
              className="w-full rounded-ros-md border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">None, just a general introduction</option>
              {mandates.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.role_title}
                  {m.client_name ? ` · ${m.client_name}` : ""}
                  {m.city ? ` · ${m.city}` : ""}
                </option>
              ))}
            </select>
            {mandate && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-600 dark:text-slate-300">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={withCtc} onChange={(e) => { setWithCtc(e.target.checked); setCustom(null); }} /> Mention CTC
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={withLink} disabled={!mandate.short_code} onChange={(e) => { setWithLink(e.target.checked); setCustom(null); }} /> Include job link
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={withCompany} onChange={(e) => { setWithCompany(e.target.checked); setCustom(null); }} /> Name the company
                </label>
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[12px] font-medium text-slate-600 dark:text-slate-300">
                Message <span className="font-normal text-slate-400">({"{name}"} becomes each person&apos;s first name)</span>
              </label>
              {custom !== null && (
                <button onClick={() => setCustom(null)} className="text-[11.5px] text-blue-600 hover:underline">
                  Reset to suggested
                </button>
              )}
            </div>
            <textarea
              value={message}
              onChange={(e) => setCustom(e.target.value)}
              rows={5}
              className="w-full rounded-ros-md border border-slate-200 bg-white px-2.5 py-2 text-[13px] leading-relaxed dark:border-slate-700 dark:bg-slate-900"
            />
            <p className="mt-1 text-[11.5px] text-slate-400">
              {sender ? `Sent as ${sender}.` : "Sent as StaffAnchor."} You can still edit the text in WhatsApp before pressing Send.
            </p>
          </div>

          <div>
            <p className="mb-1.5 text-[12px] font-medium text-slate-600 dark:text-slate-300">
              {candidateIds.length > 1 ? "Click each name to open their chat with this message ready" : "Open the chat"}
            </p>
            {loading ? (
              <p className="py-3 text-[12.5px] text-slate-400">Loading…</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-ros-md border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                {recipients.map((r) => {
                  const href = whatsappLink(r.phone, message.replaceAll("{name}", firstNameOf(r.full_name)));
                  const done = sent.has(r.id);
                  return (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">{r.full_name}</p>
                        <p className="text-[11.5px] text-slate-400">{r.phone || "No phone number on file"}</p>
                      </div>
                      {href ? (
                        <a
                          href={href}
                          target={WHATSAPP_TARGET}
                          rel="noreferrer"
                          onClick={() => markSent(r)}
                          className={`flex shrink-0 items-center gap-1 rounded-ros-md px-2.5 py-1.5 text-[12px] font-medium ${
                            done ? "bg-slate-100 text-slate-500 dark:bg-slate-800" : "bg-emerald-600 text-white hover:bg-emerald-500"
                          }`}
                        >
                          {done ? <Check className="h-3 w-3" /> : <MessageCircle className="h-3 w-3" />}
                          {done ? "Opened, open again" : "Open WhatsApp"}
                        </a>
                      ) : (
                        <span className="text-[11.5px] text-slate-400">Can&apos;t send</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 dark:border-slate-800">
          <p className="text-[12px] text-slate-500">
            {allDone ? "All chats opened." : `${sent.size} of ${withPhone.length} opened`}
          </p>
          <button onClick={onClose} className="rounded-ros-md bg-slate-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900">
            {allDone ? "Done" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
