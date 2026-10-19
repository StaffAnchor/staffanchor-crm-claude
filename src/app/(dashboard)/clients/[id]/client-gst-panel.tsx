"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { parseGstin } from "@/lib/gst";

// Some clients bill from more than one GST-registered office (People
// Interactive: Ahmedabad + Delhi, on the two tax invoices we already have on
// file) -- one clients.gstin column can't express that, so this is a
// separate table (client_gst_registrations) with a "default" pick for
// generate-invoice to fall back on when a mandate's city doesn't match any
// registration's label/address.

export type GstRegistration = {
  id: string;
  label: string;
  gstin: string;
  state_code: string;
  state_name: string | null;
  billing_address: string | null;
  contact_phone: string | null;
  is_default: boolean;
};

const EMPTY_DRAFT = { label: "", gstin: "", state_code: "", state_name: "", billing_address: "", contact_phone: "" };

export default function ClientGstPanel({ clientId, initial }: { clientId: string; initial: GstRegistration[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [registrations, setRegistrations] = useState(initial);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<{ legalName: string | null; tradeName: string | null; status: string | null; address: string | null } | null>(null);
  const [looking, setLooking] = useState(false);

  async function fetchOnline() {
    setLooking(true);
    setLookup(null);
    setError(null);
    const res = await fetch(`/api/admin/gst-lookup?gstin=${encodeURIComponent(draft.gstin)}`);
    const json = await res.json().catch(() => ({ ok: false, error: "Lookup failed" }));
    setLooking(false);
    if (!json.ok) {
      setError(json.error ?? "Lookup failed");
      return;
    }
    setLookup(json);
  }

  function useLookup() {
    if (!lookup) return;
    setDraft((d) => ({ ...d, billing_address: lookup.address ?? d.billing_address, label: d.label || lookup.tradeName || lookup.legalName || "" }));
    setLookup(null);
  }

  function startAdd() {
    setLookup(null);
    setDraft(EMPTY_DRAFT);
    setEditingId("new");
    setError(null);
  }

  function startEdit(r: GstRegistration) {
    setDraft({
      label: r.label,
      gstin: r.gstin,
      state_code: r.state_code,
      state_name: r.state_name ?? "",
      billing_address: r.billing_address ?? "",
      contact_phone: r.contact_phone ?? "",
    });
    setEditingId(r.id);
    setError(null);
  }

  async function handleSave() {
    if (!draft.label.trim() || !draft.gstin.trim()) {
      setError("Label and GSTIN are required.");
      return;
    }
    const parsed = parseGstin(draft.gstin);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      client_id: clientId,
      label: draft.label.trim(),
      gstin: parsed.gstin,
      state_code: parsed.stateCode,
      state_name: parsed.stateName,
      billing_address: draft.billing_address.trim() || null,
      contact_phone: draft.contact_phone.trim() || null,
    };
    const isNew = editingId === "new";
    const { data, error: saveError } = isNew
      ? await supabase.from("client_gst_registrations").insert(payload).select("*").single()
      : await supabase.from("client_gst_registrations").update(payload).eq("id", editingId).select("*").single();
    setSaving(false);
    if (saveError || !data) {
      setError(saveError?.message ?? "Failed to save");
      return;
    }
    setRegistrations((prev) => (isNew ? [...prev, data as GstRegistration] : prev.map((r) => (r.id === data.id ? (data as GstRegistration) : r))));
    setEditingId(null);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this GST registration?")) return;
    const { error: deleteError } = await supabase.from("client_gst_registrations").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setRegistrations((prev) => prev.filter((r) => r.id !== id));
    router.refresh();
  }

  async function handleSetDefault(id: string) {
    // Clear any existing default first (unique index only allows one),
    // then set the new one -- two calls, but this table is tiny per client.
    await supabase.from("client_gst_registrations").update({ is_default: false }).eq("client_id", clientId).eq("is_default", true);
    const { error: updateError } = await supabase.from("client_gst_registrations").update({ is_default: true }).eq("id", id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setRegistrations((prev) => prev.map((r) => ({ ...r, is_default: r.id === id })));
    router.refresh();
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">GST registrations</h2>
          <p className="text-xs text-slate-400 mt-0.5">Used on generated Proforma/Tax Invoices. Add one per billing office.</p>
        </div>
        {editingId === null && (
          <button onClick={startAdd} className="flex items-center gap-1 text-[12px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
            <Plus className="w-3 h-3" /> Add
          </button>
        )}
      </div>

      {registrations.length === 0 && editingId === null && (
        <p className="text-[12px] text-amber-600">No GST details on file — invoice generation for this client will be blocked until you add one.</p>
      )}

      <div className="space-y-2">
        {registrations.map((r) =>
          editingId === r.id ? (
            <RegistrationForm key={r.id} draft={draft} setDraft={setDraft} error={error} saving={saving} onSave={handleSave} lookup={lookup} looking={looking} onFetch={fetchOnline} onUseLookup={useLookup} onCancel={() => setEditingId(null)} />
          ) : (
            <div key={r.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-[12.5px]">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-slate-800 dark:text-slate-200">{r.label}</span>
                    {r.is_default && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-amber-600">
                        <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" /> Default
                      </span>
                    )}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400">GSTIN: {r.gstin}</div>
                  <div className="text-slate-500 dark:text-slate-400">
                    {r.state_name ? `${r.state_name} (${r.state_code})` : r.state_code}
                  </div>
                  {r.billing_address && <div className="text-slate-400 mt-0.5">{r.billing_address}</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!r.is_default && (
                    <button onClick={() => handleSetDefault(r.id)} className="text-slate-400 hover:text-amber-600" title="Set as default">
                      <Star className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button onClick={() => startEdit(r)} className="text-slate-400 hover:text-slate-800 dark:hover:text-slate-100">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(r.id)} className="text-slate-400 hover:text-red-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )
        )}
        {editingId === "new" && (
          <RegistrationForm draft={draft} setDraft={setDraft} error={error} saving={saving} onSave={handleSave} lookup={lookup} looking={looking} onFetch={fetchOnline} onUseLookup={useLookup} onCancel={() => setEditingId(null)} />
        )}
      </div>
    </div>
  );
}

function RegistrationForm({
  draft,
  setDraft,
  error,
  saving,
  onSave,
  onCancel,
  lookup,
  looking,
  onFetch,
  onUseLookup,
}: {
  draft: typeof EMPTY_DRAFT;
  setDraft: (d: typeof EMPTY_DRAFT) => void;
  error: string | null;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  lookup: { legalName: string | null; tradeName: string | null; status: string | null; address: string | null } | null;
  looking: boolean;
  onFetch: () => void;
  onUseLookup: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-300 dark:border-slate-600 p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          placeholder="Label (e.g. Noida HO, Ahmedabad)"
          className="rounded-md border border-slate-300 px-2 py-1.5 text-[12.5px] outline-none focus:ring-2 focus:ring-slate-500"
        />
        <input
          value={draft.gstin}
          onChange={(e) => {
            const gstin = e.target.value.toUpperCase().replace(/\s/g, "");
            const p = gstin.length === 15 ? parseGstin(gstin) : null;
            setDraft(p?.ok ? { ...draft, gstin, state_code: p.stateCode, state_name: p.stateName } : { ...draft, gstin });
          }}
          placeholder="GSTIN (state fills in automatically)"
          className="rounded-md border border-slate-300 px-2 py-1.5 text-[12.5px] outline-none focus:ring-2 focus:ring-slate-500"
        />
        <input
          value={draft.state_code}
          onChange={(e) => setDraft({ ...draft, state_code: e.target.value })}
          placeholder="State code (e.g. 09)"
          className="rounded-md border border-slate-300 px-2 py-1.5 text-[12.5px] outline-none focus:ring-2 focus:ring-slate-500"
        />
        <input
          value={draft.state_name}
          onChange={(e) => setDraft({ ...draft, state_name: e.target.value })}
          placeholder="State name"
          className="rounded-md border border-slate-300 px-2 py-1.5 text-[12.5px] outline-none focus:ring-2 focus:ring-slate-500"
        />
      </div>
      {draft.gstin.length === 15 && (() => {
        const p = parseGstin(draft.gstin);
        return p.ok ? (
          <p className="text-[11.5px] text-emerald-600">Valid GSTIN · {p.stateName} ({p.stateCode}) · PAN {p.pan}</p>
        ) : (
          <p className="text-[11.5px] text-red-600">{p.error}</p>
        );
      })()}
      {draft.gstin.length === 15 && parseGstin(draft.gstin).ok && (
        <button type="button" onClick={onFetch} disabled={looking} className="text-[12px] text-teal-600 hover:underline disabled:opacity-50">
          {looking ? "Fetching…" : "Fetch name & address online"}
        </button>
      )}
      {lookup && (
        <div className="rounded-md border border-teal-200 bg-teal-50 dark:bg-teal-950/20 dark:border-teal-900 p-2.5 text-[12px] space-y-0.5">
          <div className="font-medium text-slate-800 dark:text-slate-100">{lookup.legalName ?? "—"}</div>
          {lookup.tradeName && lookup.tradeName !== lookup.legalName && <div className="text-slate-500">Trade name: {lookup.tradeName}</div>}
          {lookup.status && <div className="text-slate-500">Status: {lookup.status}</div>}
          <div className="text-slate-600 dark:text-slate-300">{lookup.address ?? "No address returned"}</div>
          <button type="button" onClick={onUseLookup} className="mt-1 rounded-md bg-teal-600 text-white text-[12px] px-2 py-1">
            Looks right, use this
          </button>
        </div>
      )}
      <input
        value={draft.contact_phone}
        onChange={(e) => setDraft({ ...draft, contact_phone: e.target.value })}
        placeholder="Contact phone (optional)"
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-[12.5px] outline-none focus:ring-2 focus:ring-slate-500"
      />
      <textarea
        value={draft.billing_address}
        onChange={(e) => setDraft({ ...draft, billing_address: e.target.value })}
        placeholder="Billing address"
        rows={2}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-[12.5px] outline-none focus:ring-2 focus:ring-slate-500"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onSave} disabled={saving} className="rounded-md bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-[12px] font-medium px-2.5 py-1.5">
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} className="rounded-md border border-slate-300 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-[12px] font-medium px-2.5 py-1.5">
          Cancel
        </button>
      </div>
    </div>
  );
}
