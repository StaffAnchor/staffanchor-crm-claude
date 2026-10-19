"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { parseGstin } from "@/lib/gst";

type Fetched = { legalName: string | null; tradeName: string | null; status: string | null; address: string | null; city: string | null };

export default function CreateClientForm() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [hqCity, setHqCity] = useState("");
  const [website, setWebsite] = useState("");
  const [gstin, setGstin] = useState("");
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const [applied, setApplied] = useState<Fetched | null>(null);
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gst = gstin.length === 15 ? parseGstin(gstin) : null;

  async function fetchOnline() {
    setLooking(true);
    setFetched(null);
    setError(null);
    const res = await fetch(`/api/admin/gst-lookup?gstin=${encodeURIComponent(gstin)}`);
    const json = await res.json().catch(() => ({ ok: false, error: "Lookup failed" }));
    setLooking(false);
    if (!json.ok) {
      setError(json.error ?? "Lookup failed");
      return;
    }
    setFetched(json);
  }

  function useFetched() {
    if (!fetched) return;
    setName(fetched.legalName ?? name);
    if (fetched.city) setHqCity(fetched.city);
    setApplied(fetched);
    setFetched(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (gstin && !(gst && gst.ok)) {
      setError(gst && !gst.ok ? gst.error : "A GSTIN has 15 characters.");
      return;
    }
    setSaving(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error: insertError } = await supabase
      .from("clients")
      .insert({
        name: name.trim(),
        industry: industry.trim() || null,
        hq_city: hqCity.trim() || null,
        website: website.trim() || null,
        // Whoever creates the client is its default owner -- matters most
        // for a Partner bringing this client in themselves; admin/recruiter
        // created clients can be reassigned to a partner afterward from the
        // client detail page.
        owner_id: user?.id ?? null,
      })
      .select("id")
      .single();
    if (insertError) {
      setSaving(false);
      setError(insertError.message);
      return;
    }
    // A valid GSTIN becomes the client's default billing registration, so
    // invoices work straight away.
    if (gst && gst.ok) {
      await supabase.from("client_gst_registrations").insert({
        client_id: data.id,
        label: hqCity.trim() || applied?.city || "Main office",
        gstin: gst.gstin,
        state_code: gst.stateCode,
        state_name: gst.stateName,
        billing_address: applied?.address ?? null,
        is_default: true,
      });
    }
    setSaving(false);
    router.push(`/clients/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">GSTIN (optional)</label>
        <input
          value={gstin}
          onChange={(e) => {
            setGstin(e.target.value.toUpperCase().replace(/\s/g, ""));
            setFetched(null);
            setApplied(null);
          }}
          maxLength={15}
          placeholder="Add it to fetch the name and address"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-500"
        />
        {gst && !gst.ok && <p className="text-[11.5px] text-red-600 mt-1">{gst.error}</p>}
        {gst && gst.ok && (
          <p className="text-[11.5px] text-emerald-600 mt-1">
            Valid · {gst.stateName} ({gst.stateCode}) ·{" "}
            <button type="button" onClick={fetchOnline} disabled={looking} className="underline disabled:opacity-50">
              {looking ? "Fetching…" : "Fetch name & address"}
            </button>
          </p>
        )}
        {fetched && (
          <div className="mt-2 rounded-md border border-teal-200 bg-teal-50 dark:bg-teal-950/20 dark:border-teal-900 p-2.5 text-[12px] space-y-0.5">
            <div className="font-medium text-slate-800 dark:text-slate-100">{fetched.legalName ?? "—"}</div>
            {fetched.status && <div className="text-slate-500">Status: {fetched.status}</div>}
            <div className="text-slate-600 dark:text-slate-300">{fetched.address ?? "No address returned"}</div>
            <button type="button" onClick={useFetched} className="mt-1 rounded-md bg-teal-600 text-white text-[12px] px-2 py-1">
              Looks right, use this
            </button>
          </div>
        )}
        {applied && <p className="text-[11.5px] text-slate-400 mt-1">Name, city and billing address filled in from the GST record.</p>}
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Client name *</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Acme Retail Pvt Ltd"
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Industry</label>
        <input
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="e.g. FMCG, SaaS, BFSI"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">HQ city</label>
        <input
          value={hqCity}
          onChange={(e) => setHqCity(e.target.value)}
          placeholder="e.g. Mumbai"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Website</label>
        <input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-500"
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving || !name.trim()}
        className="w-full rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-medium py-2 transition-colors"
      >
        {saving ? "Creating…" : "+ Add client"}
      </button>
    </form>
  );
}
