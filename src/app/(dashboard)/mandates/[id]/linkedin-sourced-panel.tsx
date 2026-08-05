"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ExternalLink, Plus, UserCheck, Paperclip } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";

export type SourcedProfile = {
  id: string;
  linkedin_url: string;
  full_name: string | null;
  location: string | null;
  current_company: string | null;
  outreach_status: string;
  notes: string | null;
  created_at: string;
  promoted_candidate_id: string | null;
};

const OUTREACH_LABEL: Record<string, string> = {
  not_contacted: "Not contacted",
  request_sent: "Request sent",
  replied: "Replied",
  not_interested: "Not interested",
};
const OUTREACH_TONE: Record<string, BadgeTone> = {
  not_contacted: "neutral",
  request_sent: "info",
  replied: "success",
  not_interested: "danger",
};

// LinkedIn-sourced candidates for a mandate, kept deliberately separate from
// the real pipeline (candidate_mandate_links, shown on the left of this page)
// and from quick-apply Applicants (Sharing tab) -- these are people a
// recruiter found on LinkedIn and is still working to actually reach, not
// candidates yet. No auto-extraction: fetching a LinkedIn profile server-side
// without a logged-in session just returns nothing (LinkedIn blocks it), so
// this is deliberately a fast manual-paste form instead of scraping.
export default function LinkedInSourcedPanel({
  mandateId,
  initialProfiles,
}: {
  mandateId: string;
  initialProfiles: SourcedProfile[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [profiles, setProfiles] = useState(initialProfiles);
  const [showAdd, setShowAdd] = useState(false);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [company, setCompany] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [existingMatch, setExistingMatch] = useState<{ id: string; full_name: string } | null>(null);

  function normalizeUrl(raw: string) {
    let u = raw.trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    return u.replace(/\/$/, "");
  }

  async function handleAdd() {
    setAddError(null);
    setExistingMatch(null);
    const normalized = normalizeUrl(url);
    if (!normalized.includes("linkedin.com/")) {
      setAddError("That doesn't look like a LinkedIn profile URL.");
      return;
    }
    if (!name.trim()) {
      setAddError("Add a name so this is identifiable in the list.");
      return;
    }
    setAdding(true);

    // If this LinkedIn URL already belongs to a real candidate (e.g. added
    // earlier via the extension or manually), don't create a duplicate lead
    // -- point at linking the existing candidate onto this mandate instead
    // (via Sourcing > Align existing candidates).
    const { data: existingCandidate } = await supabase
      .from("candidates")
      .select("id, full_name")
      .eq("linkedin_url", normalized)
      .maybeSingle();
    if (existingCandidate) {
      setAdding(false);
      setExistingMatch(existingCandidate);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("mandate_sourced_profiles")
      .insert({
        mandate_id: mandateId,
        linkedin_url: normalized,
        full_name: name.trim(),
        location: location.trim() || null,
        current_company: company.trim() || null,
        added_by: user?.id ?? null,
      })
      .select()
      .single();
    setAdding(false);
    if (error) {
      setAddError(error.code === "23505" ? "Already sourced for this mandate." : error.message);
      return;
    }
    setProfiles((prev) => [data as SourcedProfile, ...prev]);
    setUrl("");
    setName("");
    setLocation("");
    setCompany("");
    setShowAdd(false);
    router.refresh();
  }

  async function updateStatus(id: string, outreach_status: string) {
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, outreach_status } : p)));
    await supabase.from("mandate_sourced_profiles").update({ outreach_status }).eq("id", id);
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">LinkedIn Sourced</h2>
        <button
          onClick={() => setShowAdd((s) => !s)}
          className="flex items-center gap-1 text-[12px] text-blue-600 hover:underline"
        >
          <Plus className="w-3.5 h-3.5" /> Add profile
        </button>
      </div>
      <p className="text-[12px] text-slate-400 mb-3">
        People you've found on LinkedIn for this role, not yet real candidates. Kept separate from the pipeline and
        Applicants until they respond and hand over contact details.
      </p>

      {showAdd && (
        <div className="mb-4 rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="linkedin.com/in/their-profile"
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-[13px]"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px]"
            />
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px]"
            />
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Current company"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px]"
            />
          </div>
          {existingMatch && (
            <p className="text-[12px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
              Already a candidate: <span className="font-medium">{existingMatch.full_name}</span>. Use the
              &quot;Sourcing&quot; tab's &quot;Align existing candidates&quot; to link them to this mandate instead.
            </p>
          )}
          {addError && <p className="text-[12px] text-red-600">{addError}</p>}
          <button
            onClick={handleAdd}
            disabled={adding}
            className="rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-[13px] font-medium px-3 py-1.5"
          >
            {adding ? "Adding..." : "Add"}
          </button>
        </div>
      )}

      <div className="space-y-1.5 max-h-96 overflow-y-auto">
        {profiles.length === 0 && (
          <p className="text-[12px] text-slate-400 py-3 text-center">No LinkedIn profiles sourced yet.</p>
        )}
        {profiles.map((p) => (
          <SourcedRow key={p.id} profile={p} mandateId={mandateId} onStatusChange={updateStatus} />
        ))}
      </div>
    </div>
  );
}

function SourcedRow({
  profile,
  mandateId,
  onStatusChange,
}: {
  profile: SourcedProfile;
  mandateId: string;
  onStatusChange: (id: string, status: string) => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [promoting, setPromoting] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePromote() {
    setError(null);
    if (!email.trim()) {
      setError("Email is required to promote to a full candidate.");
      return;
    }
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let resumeFileUrl: string | null = null;
    if (resumeFile) {
      const path = `${crypto.randomUUID()}-${resumeFile.name}`;
      const { error: uploadError } = await supabase.storage.from("resumes").upload(path, resumeFile, {
        contentType: resumeFile.type || undefined,
      });
      if (uploadError) {
        setError(`Resume upload failed: ${uploadError.message}`);
        setSaving(false);
        return;
      }
      resumeFileUrl = path;
    }

    const { data: newCandidate, error: candidateError } = await supabase
      .from("candidates")
      .insert({
        full_name: profile.full_name || "LinkedIn Candidate",
        email: email.trim(),
        phone: phone.trim() || null,
        linkedin_url: profile.linkedin_url,
        current_employer: profile.current_company,
        current_location: profile.location,
        resume_file_url: resumeFileUrl,
        status: "awaiting_input",
        created_by: "linkedin_sourced",
        created_by_user: user?.id ?? null,
        owner_id: user?.id ?? null,
      })
      .select("id")
      .single();
    if (candidateError || !newCandidate) {
      setError(candidateError?.message ?? "Couldn't create the candidate.");
      setSaving(false);
      return;
    }

    await supabase
      .from("candidate_mandate_links")
      .insert({ candidate_id: newCandidate.id, mandate_id: mandateId, added_by: user?.id ?? null });

    await supabase
      .from("mandate_sourced_profiles")
      .update({
        promoted_candidate_id: newCandidate.id,
        promoted_at: new Date().toISOString(),
        outreach_status: profile.outreach_status === "not_contacted" ? "replied" : profile.outreach_status,
      })
      .eq("id", profile.id);

    setSaving(false);
    router.refresh();
  }

  if (profile.promoted_candidate_id) {
    return (
      <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 text-[13px]">
        <div className="min-w-0">
          <a
            href={profile.linkedin_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 font-medium text-slate-800 dark:text-slate-200 hover:underline truncate"
          >
            {profile.full_name || "View LinkedIn"} <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
          <p className="text-[11px] text-slate-400 truncate">
            {[profile.current_company, profile.location].filter(Boolean).join(" · ") || " "}
          </p>
        </div>
        <Link
          href={`/candidates/${profile.promoted_candidate_id}?mandateId=${mandateId}`}
          className="shrink-0 flex items-center gap-1 text-[12px] text-emerald-700 dark:text-emerald-400 font-medium"
        >
          <UserCheck className="w-3.5 h-3.5" /> Promoted →
        </Link>
      </div>
    );
  }

  return (
    <div className="px-2.5 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 text-[13px]">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <a
            href={profile.linkedin_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 font-medium text-slate-800 dark:text-slate-200 hover:underline truncate"
          >
            {profile.full_name || "View LinkedIn"} <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
          <p className="text-[11px] text-slate-400 truncate">
            {[profile.current_company, profile.location].filter(Boolean).join(" · ") || " "}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={profile.outreach_status}
            onChange={(e) => onStatusChange(profile.id, e.target.value)}
            className="text-[11px] rounded-md border border-slate-200 dark:border-slate-700 bg-transparent px-1.5 py-1"
          >
            {Object.entries(OUTREACH_LABEL).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
          <Badge tone={OUTREACH_TONE[profile.outreach_status]} size="sm">
            {OUTREACH_LABEL[profile.outreach_status]}
          </Badge>
        </div>
      </div>

      {!promoting ? (
        <button onClick={() => setPromoting(true)} className="mt-1.5 text-[11.5px] text-blue-600 hover:underline">
          Promote to candidate (they replied &amp; shared contact details)
        </button>
      ) : (
        <div className="mt-2 space-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email *"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px]"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px]"
            />
          </div>
          <label className="flex items-center gap-1.5 text-[12px] text-slate-500 cursor-pointer">
            <Paperclip className="w-3 h-3" />
            {resumeFile ? resumeFile.name : "Attach resume (optional)"}
            <input
              type="file"
              className="hidden"
              onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
              accept=".pdf,.doc,.docx"
            />
          </label>
          {error && <p className="text-[11.5px] text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handlePromote}
              disabled={saving}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-[12px] font-medium px-2.5 py-1.5"
            >
              {saving ? "Promoting..." : "Promote to candidate"}
            </button>
            <button
              onClick={() => setPromoting(false)}
              className="rounded-lg border border-slate-300 text-slate-600 dark:text-slate-400 text-[12px] font-medium px-2.5 py-1.5"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
