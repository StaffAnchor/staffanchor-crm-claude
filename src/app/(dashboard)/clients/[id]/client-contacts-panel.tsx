"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star, Trash2, Phone, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type ClientContact = {
  id: string;
  full_name: string;
  designation: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
};

export default function ClientContactsPanel({
  clientId,
  initialContacts,
}: {
  clientId: string;
  initialContacts: ClientContact[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [contacts, setContacts] = useState(initialContacts);
  const [formOpen, setFormOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [designation, setDesignation] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!fullName.trim()) return;
    setSaving(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from("client_contacts")
      .insert({
        client_id: clientId,
        full_name: fullName.trim(),
        designation: designation.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        is_primary: isPrimary,
      })
      .select("id, full_name, designation, email, phone, is_primary")
      .single();
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    if (isPrimary) {
      await supabase.from("client_contacts").update({ is_primary: false }).eq("client_id", clientId).neq("id", data.id);
    }
    setContacts((prev) => [...prev.map((c) => (isPrimary ? { ...c, is_primary: false } : c)), data]);
    setFullName("");
    setDesignation("");
    setEmail("");
    setPhone("");
    setIsPrimary(false);
    setFormOpen(false);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Remove this contact?")) return;
    setContacts((prev) => prev.filter((c) => c.id !== id));
    await supabase.from("client_contacts").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Contacts</h2>
        <button
          onClick={() => setFormOpen((v) => !v)}
          className="text-[12px] font-medium text-blue-600 hover:text-blue-700"
        >
          {formOpen ? "Cancel" : "+ Add contact"}
        </button>
      </div>

      {formOpen && (
        <div className="mb-4 space-y-2 border border-slate-100 dark:border-slate-800 rounded-lg p-3 bg-slate-50 dark:bg-slate-800/50">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name *"
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-slate-500"
          />
          <input
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            placeholder="Designation (e.g. HR Manager)"
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-slate-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              type="email"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-slate-500"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-slate-500"
            />
          </div>
          <label className="flex items-center gap-2 text-[12px] text-slate-600 dark:text-slate-400">
            <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
            Mark as primary contact
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            onClick={handleAdd}
            disabled={saving || !fullName.trim()}
            className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-medium py-1.5"
          >
            {saving ? "Adding…" : "Add contact"}
          </button>
        </div>
      )}

      {contacts.length === 0 ? (
        <p className="text-[13px] text-slate-400">No contacts added yet.</p>
      ) : (
        <div className="space-y-3">
          {contacts.map((c) => (
            <div key={c.id} className="flex items-start justify-between gap-2 text-sm">
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  {c.full_name}
                  {c.is_primary && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                </p>
                {c.designation && <p className="text-[12px] text-slate-500 dark:text-slate-400">{c.designation}</p>}
                <div className="flex flex-col gap-0.5 mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                  {c.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-3 h-3" /> {c.email}
                    </span>
                  )}
                  {c.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {c.phone}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => handleDelete(c.id)} className="text-slate-300 hover:text-red-600 shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
