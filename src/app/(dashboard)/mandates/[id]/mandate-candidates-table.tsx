"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MessageCircleQuestion, Loader2, Mail, FolderPlus, Send } from "lucide-react";
import MandateScreeningPanel, { type MandateScreeningContext } from "./mandate-screening-panel";
import { STAGES, applyStageChange, type Stage, type StageSource } from "@/lib/mandate-stage";
import { StageTimeline } from "@/components/ui/stage-timeline";

const STAGE_COLOR: Record<string, string> = {
  sourced: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
  screened: "bg-blue-100 text-blue-800",
  shortlisted: "bg-teal-100 text-teal-800",
  submitted: "bg-indigo-100 text-indigo-800",
  client_interview: "bg-cyan-100 text-cyan-800",
  client_shortlisted: "bg-purple-100 text-purple-800",
  offer: "bg-lime-100 text-lime-800",
  placed: "bg-green-100 text-green-800",
  pulled_back: "bg-orange-100 text-orange-800",
  rejected: "bg-red-100 text-red-700",
};

// Stage index used only to decide whether adding to the client shortlist
// should auto-advance stage -- never downgrades a candidate who's already
// further along (e.g. already at client_interview) back to "submitted".
const STAGE_ORDER = STAGES.reduce<Record<string, number>>((acc, s, i) => ({ ...acc, [s]: i }), {});

export type MandateCandidateRow = {
  id: string;
  stage: string;
  in_shortlist: boolean;
  stage_source: StageSource | null;
  stage_updated_at: string | null;
  client_decision_at: string | null;
  rejected_from_stage: string | null;
  date_of_joining: string | null;
  created_at: string | null;
  screened: boolean;
  candidate: {
    id: string;
    full_name: string;
    email: string | null;
    category: string | null;
    sub_domain: string | null;
    total_experience_years: number | null;
    current_fixed_ctc: number | null;
    recruiter_assessment: Record<string, unknown> | null;
    work_mode: string | null;
    open_to_relocation: string | null;
    notice_period: string | null;
    segment_data: Record<string, unknown> | null;
    current_employer: string | null;
    career_timeline_resume: unknown;
    career_timeline_profile: unknown;
  };
};

export default function MandateCandidatesTable({
  rows: initialRows,
  mandateContext,
}: {
  rows: MandateCandidateRow[];
  mandateContext: MandateScreeningContext & { [key: string]: unknown };
}) {
  const router = useRouter();
  const supabase = createClient();
  const [rows, setRows] = useState(initialRows);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [emailingJd, setEmailingJd] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [screeningRowId, setScreeningRowId] = useState<string | null>(null);
  // Which row is mid-edit on its stage select, and whether that edit is
  // being attributed to the client (vs. the recruiter's own call) --
  // separate from `rows` state since most rows are never being edited.
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [clientRelayed, setClientRelayed] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [dateOfJoining, setDateOfJoining] = useState("");
  const [savingStage, setSavingStage] = useState(false);
  // Saving a group of similar candidates is often easier to do right here,
  // on a specific mandate, than from the main Candidates page -- everyone
  // sourced/screened for the same role is already sitting in one table.
  // Same candidate_groups/candidate_group_members schema and modal pattern
  // as the main Candidates table's "Add to group" action.
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [existingGroups, setExistingGroups] = useState<{ id: string; name: string }[] | null>(null);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [chosenGroupId, setChosenGroupId] = useState("");
  const [newGroupName, setNewGroupName] = useState("");

  // Email selected candidates (summary + resumes attached) straight to one
  // or more client contacts, from client_contacts on this mandate's client
  // -- passed down server-side in mandateContext so the picker opens
  // instantly with no extra round trip. Sending auto-marks every included
  // candidate in_shortlist + stage "submitted" (see the API route), the
  // same real-world event as "Move to client shortlist" above, just
  // triggered by the email going out instead of a separate manual click.
  const clientContacts = (mandateContext.clientContacts as { id: string; full_name: string; email: string | null; is_primary: boolean }[]) ?? [];
  const contactsWithEmail = clientContacts.filter((c) => c.email);
  // Client-level resource library (website, YouTube, profile PDF, etc.) --
  // shared across every mandate for this client, so a recruiter picks which
  // ones to include alongside the JD rather than always sending everything.
  const clientResources =
    (mandateContext.clientResources as { id: string; kind: "link" | "file"; name: string; url: string | null }[]) ?? [];
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [chosenContactIds, setChosenContactIds] = useState<Set<string>>(new Set());
  const [sendingClientEmail, setSendingClientEmail] = useState(false);

  function openEmailModal() {
    // Default to the primary contact if there is one, so the common case
    // (one key contact) is a single click away instead of forcing a pick
    // every time.
    const primary = contactsWithEmail.find((c) => c.is_primary);
    setChosenContactIds(new Set(primary ? [primary.id] : []));
    setEmailModalOpen(true);
  }

  function toggleContact(contactId: string) {
    setChosenContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  async function handleSendToClient() {
    if (chosenContactIds.size === 0) return;
    setSendingClientEmail(true);
    setMessage(null);
    const candidateIds = Array.from(selected)
      .map((linkId) => rows.find((r) => r.id === linkId)?.candidate.id)
      .filter((v): v is string => Boolean(v));
    try {
      const res = await fetch(`/api/mandates/${mandateContext.mandateId}/email-to-client`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds, contactIds: Array.from(chosenContactIds) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to email the client.");
      const ids = Array.from(selected);
      setRows((prev) =>
        prev.map((r) =>
          ids.includes(r.id)
            ? { ...r, in_shortlist: true, stage: (STAGE_ORDER[r.stage] ?? 0) >= STAGE_ORDER["submitted"] ? r.stage : "submitted" }
            : r
        )
      );
      setEmailModalOpen(false);
      setSelected(new Set());
      setMessage({
        type: "success",
        text:
          `Emailed ${data.candidateCount} candidate${data.candidateCount === 1 ? "" : "s"} to ${data.sentTo.join(", ")}` +
          ` and marked ${data.candidateCount === 1 ? "them" : "them all"} submitted to client.` +
          (data.resumeless?.length > 0 ? ` (No resume on file for: ${data.resumeless.join(", ")}.)` : ""),
      });
      router.refresh();
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Failed to email the client." });
    } finally {
      setSendingClientEmail(false);
    }
  }

  function toggleRow(linkId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(linkId)) next.delete(linkId);
      else next.add(linkId);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  async function saveStage(row: MandateCandidateRow, newStage: Stage) {
    setSavingStage(true);
    setMessage(null);
    try {
      const source: StageSource = clientRelayed ? "client_relayed" : "recruiter";
      await applyStageChange(supabase, {
        linkId: row.id,
        candidateId: row.candidate.id,
        mandateId: mandateContext.mandateId as string,
        candidateName: row.candidate.full_name,
        mandateLabel: `${mandateContext.role_title as string} — ${mandateContext.client_name as string}`,
        previousStage: row.stage,
        newStage,
        source,
        rejectionReason: newStage === "rejected" ? rejectionReason : undefined,
        // Save whenever a date is entered, not just when advancing to
        // "placed" -- a client often confirms joining well before the
        // recruiter formally marks the candidate Placed (e.g. right at
        // Offer), and that's exactly when it's worth capturing.
        dateOfJoining: dateOfJoining || undefined,
      });
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, stage: newStage, stage_source: source, date_of_joining: dateOfJoining || r.date_of_joining } : r))
      );
      setEditingStageId(null);
      setClientRelayed(false);
      setRejectionReason("");
      setDateOfJoining("");
      router.refresh();
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Failed to update stage." });
    } finally {
      setSavingStage(false);
    }
  }

  // Lets a recruiter record/update the joining date on its own, without
  // also having to re-pick the stage -- the date-of-joining input's
  // onChange doesn't fire a save by itself (the stage <select>'s onChange
  // is what triggers saveStage above), so without this, a candidate
  // already sitting at Offer with no stage change pending would have no
  // way to persist a date the client just confirmed.
  async function saveJoiningDate(row: MandateCandidateRow) {
    if (!dateOfJoining) return;
    setSavingStage(true);
    setMessage(null);
    try {
      await applyStageChange(supabase, {
        linkId: row.id,
        candidateId: row.candidate.id,
        mandateId: mandateContext.mandateId as string,
        candidateName: row.candidate.full_name,
        mandateLabel: `${mandateContext.role_title as string} — ${mandateContext.client_name as string}`,
        previousStage: row.stage,
        newStage: row.stage as Stage,
        source: "recruiter",
        dateOfJoining,
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, date_of_joining: dateOfJoining } : r)));
      setEditingStageId(null);
      setDateOfJoining("");
      router.refresh();
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Failed to save joining date." });
    } finally {
      setSavingStage(false);
    }
  }

  // Adding a candidate to the client shortlist and their pipeline stage are
  // the same real-world event from the client's point of view -- being put
  // in front of the client -- so this keeps stage in sync automatically
  // instead of leaving a recruiter to remember to also flip the Stage
  // dropdown. Only auto-advances (never downgrades someone already further
  // along, e.g. already at client_interview), and only auto-syncs this one
  // direction: manually setting Stage to "submitted" from the dropdown does
  // NOT add someone to the shortlist, since a recruiter might mark that for
  // other reasons (e.g. submitted outside this tool).
  async function syncStageForShortlist(row: MandateCandidateRow, addingToShortlist: boolean) {
    const newStage: Stage = addingToShortlist ? "submitted" : "pulled_back";
    if (addingToShortlist && (STAGE_ORDER[row.stage] ?? 0) >= STAGE_ORDER["submitted"]) return; // already further along, don't downgrade
    if (!addingToShortlist && row.stage === "pulled_back") return; // already pulled back

    try {
      await applyStageChange(supabase, {
        linkId: row.id,
        candidateId: row.candidate.id,
        mandateId: mandateContext.mandateId as string,
        candidateName: row.candidate.full_name,
        mandateLabel: `${mandateContext.role_title as string} — ${mandateContext.client_name as string}`,
        previousStage: row.stage,
        newStage,
        source: "recruiter",
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, stage: newStage, stage_source: "recruiter" } : r)));
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Failed to sync stage with shortlist status." });
    }
  }

  async function toggleShortlist(linkId: string, next: boolean) {
    const row = rows.find((r) => r.id === linkId);
    setRows((prev) => prev.map((r) => (r.id === linkId ? { ...r, in_shortlist: next } : r)));
    const { error } = await supabase.from("candidate_mandate_links").update({ in_shortlist: next }).eq("id", linkId);
    if (error) {
      setMessage({ type: "error", text: error.message });
      setRows((prev) => prev.map((r) => (r.id === linkId ? { ...r, in_shortlist: !next } : r)));
      return;
    }
    if (row) await syncStageForShortlist(row, next);
    router.refresh();
  }

  async function handleBulkShortlist() {
    setBusy(true);
    setMessage(null);
    const ids = Array.from(selected);
    const targetRows = rows.filter((r) => ids.includes(r.id));
    const { error } = await supabase.from("candidate_mandate_links").update({ in_shortlist: true }).in("id", ids);
    if (error) {
      setBusy(false);
      setMessage({ type: "error", text: error.message });
      return;
    }
    setRows((prev) => prev.map((r) => (ids.includes(r.id) ? { ...r, in_shortlist: true } : r)));
    await Promise.all(targetRows.map((row) => syncStageForShortlist(row, true)));
    setBusy(false);
    setSelected(new Set());
    setMessage({ type: "success", text: `Moved ${ids.length} candidate${ids.length === 1 ? "" : "s"} to the client shortlist and set stage to submitted.` });
    router.refresh();
  }

  const [jdModalOpen, setJdModalOpen] = useState(false);
  const [chosenResourceIds, setChosenResourceIds] = useState<Set<string>>(new Set());

  function openJdModal() {
    setChosenResourceIds(new Set());
    setJdModalOpen(true);
  }

  function toggleResource(resourceId: string) {
    setChosenResourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(resourceId)) next.delete(resourceId);
      else next.add(resourceId);
      return next;
    });
  }

  async function handleEmailJd() {
    setEmailingJd(true);
    setMessage(null);
    const candidateIds = Array.from(selected)
      .map((linkId) => rows.find((r) => r.id === linkId)?.candidate.id)
      .filter((v): v is string => Boolean(v));
    try {
      const res = await fetch(`/api/mandates/${mandateContext.mandateId}/email-jd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds, resourceIds: Array.from(chosenResourceIds) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to email the JD.");
      setJdModalOpen(false);
      const sentCount = data.sent?.length ?? 0;
      const failedCount = data.failed?.length ?? 0;
      setMessage({
        type: failedCount > 0 && sentCount === 0 ? "error" : "success",
        text:
          `JD emailed to ${sentCount} candidate${sentCount === 1 ? "" : "s"}.` +
          (failedCount > 0
            ? ` ${failedCount} failed (${data.failed.map((f: { name: string; reason: string }) => `${f.name}: ${f.reason}`).join(", ")}).`
            : ""),
      });
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Failed to email the JD." });
    } finally {
      setEmailingJd(false);
    }
  }

  async function handleBulkUnlink() {
    if (!window.confirm(`Remove ${selected.size} candidate(s) from this mandate? This does not delete their profile.`)) return;
    setBusy(true);
    setMessage(null);
    const ids = Array.from(selected);
    const { error } = await supabase.from("candidate_mandate_links").delete().in("id", ids);
    setBusy(false);
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }
    setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
    setSelected(new Set());
    setMessage({ type: "success", text: `Removed ${ids.length} candidate${ids.length === 1 ? "" : "s"} from this mandate.` });
    router.refresh();
  }

  async function openGroupModal() {
    setGroupModalOpen(true);
    if (existingGroups !== null) return;
    setGroupsLoading(true);
    const { data } = await supabase.from("candidate_groups").select("id, name").order("name");
    setExistingGroups(data ?? []);
    setGroupsLoading(false);
  }

  // `selected` here holds candidate_mandate_links.id (the row/link id), not
  // candidate id -- map through `rows` to the underlying candidate before
  // writing to candidate_group_members. ignoreDuplicates on the insert
  // means re-adding someone already in the group is a harmless no-op.
  async function handleAddToGroup() {
    if (selected.size === 0) return;
    if (!chosenGroupId && !newGroupName.trim()) return;
    setBusy(true);
    setMessage(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let groupId = chosenGroupId;
    if (!groupId) {
      const { data: created, error: createError } = await supabase
        .from("candidate_groups")
        .insert({ name: newGroupName.trim(), created_by: user?.id ?? null })
        .select("id")
        .single();
      if (createError || !created) {
        setBusy(false);
        setMessage({ type: "error", text: `Failed to create group: ${createError?.message ?? "unknown error"}` });
        return;
      }
      groupId = created.id;
    }

    const candidateIds = Array.from(selected)
      .map((linkId) => rows.find((r) => r.id === linkId)?.candidate.id)
      .filter((v): v is string => Boolean(v));
    const memberRows = candidateIds.map((candidate_id) => ({
      group_id: groupId,
      candidate_id,
      added_by: user?.id ?? null,
    }));
    const { error } = await supabase.from("candidate_group_members").upsert(memberRows, {
      onConflict: "group_id,candidate_id",
      ignoreDuplicates: true,
    });
    setBusy(false);
    if (error) {
      setMessage({ type: "error", text: `Failed to add to group: ${error.message}` });
      return;
    }
    setGroupModalOpen(false);
    setChosenGroupId("");
    setNewGroupName("");
    setExistingGroups(null);
    setMessage({ type: "success", text: `Added ${memberRows.length} candidate${memberRows.length === 1 ? "" : "s"} to the group.` });
    setSelected(new Set());
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mt-6 shadow-sm">
      {message && (
        <div className={`px-4 py-2 text-xs font-medium ${message.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      )}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 bg-slate-900 px-4 py-2.5 text-sm text-white">
          <span>{selected.size} selected</span>
          <div className="flex gap-2">
            <button
              onClick={handleBulkShortlist}
              disabled={busy}
              className="rounded-lg bg-teal-500 hover:bg-teal-400 disabled:opacity-50 px-3 py-1.5 text-xs font-medium"
            >
              Move to client shortlist
            </button>
            <button
              onClick={openJdModal}
              disabled={emailingJd}
              className="flex items-center gap-1.5 rounded-lg bg-blue-500 hover:bg-blue-400 disabled:opacity-50 px-3 py-1.5 text-xs font-medium"
              title="Emails the JD PDF (plus any company resources you pick) to each selected candidate's email on file"
            >
              {emailingJd ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
              Email JD
            </button>
            <button
              onClick={openEmailModal}
              disabled={contactsWithEmail.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-purple-500 hover:bg-purple-400 disabled:opacity-50 px-3 py-1.5 text-xs font-medium"
              title={
                contactsWithEmail.length === 0
                  ? "This client has no contact with an email on file yet -- add one from the client's page"
                  : "Emails these candidates' summaries + resumes to a client contact, and marks them submitted to client"
              }
            >
              <Send className="w-3 h-3" />
              Email to Client
            </button>
            <button
              onClick={openGroupModal}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 px-3 py-1.5 text-xs font-medium"
              title="Save these candidates as a reusable named segment"
            >
              <FolderPlus className="w-3 h-3" />
              Add to group
            </button>
            <button
              onClick={handleBulkUnlink}
              disabled={busy}
              className="rounded-lg bg-red-500 hover:bg-red-400 disabled:opacity-50 px-3 py-1.5 text-xs font-medium"
            >
              Reject / remove from mandate
            </button>
            <button onClick={() => setSelected(new Set())} className="rounded-lg border border-white/30 px-3 py-1.5 text-xs">
              Clear
            </button>
          </div>
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">
          <tr>
            <th className="px-4 py-2.5 w-8">
              <input
                type="checkbox"
                checked={rows.length > 0 && selected.size === rows.length}
                onChange={toggleAll}
              />
            </th>
            <th className="text-left px-4 py-2.5">Candidate</th>
            <th className="text-left px-4 py-2.5">Fixed CTC</th>
            <th className="text-left px-4 py-2.5">Recommendation</th>
            <th className="text-left px-4 py-2.5">Screening</th>
            <th className="text-left px-4 py-2.5">Stage</th>
            <th className="text-left px-4 py-2.5">In client shortlist</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((l) => (
            <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50">
              <td className="px-4 py-3">
                <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleRow(l.id)} />
              </td>
              <td className="px-4 py-3">
                <Link href={`/candidates/${l.candidate.id}?mandateId=${mandateContext.mandateId}`} className="font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600">
                  {l.candidate.full_name}
                </Link>
                <div className="text-xs text-slate-400">{l.candidate.sub_domain}</div>
              </td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                {l.candidate.current_fixed_ctc ? `₹${l.candidate.current_fixed_ctc}L` : "—"}
              </td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                {(l.candidate.recruiter_assessment?.["overall_recommendation"] as string) ?? "Not assessed"}
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => setScreeningRowId(l.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-200 ease-ros hover:-translate-y-px active:translate-y-0 active:scale-[0.98] ${
                    l.screened
                      ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                      : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                  }`}
                >
                  <MessageCircleQuestion className="w-3 h-3" />
                  {l.screened ? "Screened" : "Screen"}
                </button>
              </td>
              <td className="px-4 py-3">
                {editingStageId === l.id ? (
                  <div className="flex flex-col gap-1.5 min-w-[160px]">
                    <select
                      defaultValue={l.stage}
                      autoFocus
                      onChange={(e) => saveStage(l, e.target.value as Stage)}
                      disabled={savingStage}
                      className="text-xs rounded-ros-md border border-slate-200 dark:border-slate-700 px-2 py-1"
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>
                          {s.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400">
                      <input type="checkbox" checked={clientRelayed} onChange={(e) => setClientRelayed(e.target.checked)} />
                      Client told us this
                    </label>
                    <input
                      type="text"
                      placeholder="Rejection reason (if rejected)"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      className="text-xs rounded-ros-md border border-slate-200 dark:border-slate-700 px-2 py-1"
                    />
                    <label className="text-[10px] text-slate-400">
                      Joining date (expected or confirmed -- can be set at any stage)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="date"
                        value={dateOfJoining}
                        onChange={(e) => setDateOfJoining(e.target.value)}
                        className="text-xs rounded-ros-md border border-slate-200 dark:border-slate-700 px-2 py-1 flex-1"
                      />
                      <button
                        onClick={() => saveJoiningDate(l)}
                        disabled={savingStage || !dateOfJoining}
                        className="text-[10.5px] font-medium text-blue-600 hover:text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                      >
                        Save
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        setEditingStageId(null);
                        setClientRelayed(false);
                        setRejectionReason("");
                        setDateOfJoining("");
                      }}
                      className="text-[11px] text-slate-400 hover:text-slate-600 text-left"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 items-start">
                    <button
                      onClick={() => {
                        setEditingStageId(l.id);
                        setDateOfJoining(l.date_of_joining ?? "");
                      }}
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium transition-all duration-200 ease-ros hover:-translate-y-px active:translate-y-0 active:scale-[0.98] ${STAGE_COLOR[l.stage] ?? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"}`}
                    >
                      {l.stage_source && l.stage_source !== "recruiter" && "🔔 "}
                      {l.stage.replace(/_/g, " ")}
                    </button>
                    {/* Pipeline-progress-at-a-glance -- see stage-timeline.tsx for the
                        honest caveat that only the current dot has a real date, since
                        we don't log a full per-transition history. */}
                    <StageTimeline stage={l.stage} stageUpdatedAt={l.stage_updated_at} rejectedFromStage={l.rejected_from_stage} />
                    {l.date_of_joining && (
                      <span className="text-[10.5px] text-emerald-600 dark:text-emerald-400 font-medium whitespace-nowrap">
                        Joining {new Date(l.date_of_joining).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => toggleShortlist(l.id, !l.in_shortlist)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    l.in_shortlist ? "bg-teal-100 text-teal-800 hover:bg-teal-200" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {l.in_shortlist ? "Yes — click to remove" : "No — click to add"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-10">
          No candidates linked yet. Link candidates from their profile page.
        </p>
      )}

      {screeningRowId && (() => {
        const row = rows.find((r) => r.id === screeningRowId);
        if (!row) return null;
        return (
          <MandateScreeningPanel
            open={true}
            onClose={() => setScreeningRowId(null)}
            candidate={row.candidate}
            mandateContext={mandateContext}
            onSaved={() => {
              setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, screened: true } : r)));
              router.refresh();
            }}
          />
        );
      })()}

      {groupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setGroupModalOpen(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 mb-1">
              Add {selected.size} candidate{selected.size === 1 ? "" : "s"} to a group
            </h3>
            <p className="text-[12px] text-slate-400 mb-3">
              Saved groups live under Candidates → Groups, for reusable segments you come back to.
            </p>
            {groupsLoading ? (
              <p className="text-[12.5px] text-slate-400 flex items-center gap-1.5 mb-3">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading groups...
              </p>
            ) : (
              <select
                value={chosenGroupId}
                onChange={(e) => {
                  setChosenGroupId(e.target.value);
                  if (e.target.value) setNewGroupName("");
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] mb-2"
              >
                <option value="">Select an existing group...</option>
                {(existingGroups ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
            <p className="text-[11px] text-slate-400 mb-1.5">or create a new one:</p>
            <input
              value={newGroupName}
              onChange={(e) => {
                setNewGroupName(e.target.value);
                if (e.target.value) setChosenGroupId("");
              }}
              placeholder="New group name"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setGroupModalOpen(false)}
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-[13px] font-medium py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleAddToGroup}
                disabled={(!chosenGroupId && !newGroupName.trim()) || busy}
                className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-medium py-2 disabled:opacity-50"
              >
                {busy ? "Adding..." : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
      {emailModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setEmailModalOpen(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 mb-1">
              Email {selected.size} candidate{selected.size === 1 ? "" : "s"} to the client
            </h3>
            <p className="text-[12px] text-slate-400 mb-3">
              Sends a summary + resumes to the contact(s) you pick, and marks {selected.size === 1 ? "this candidate" : "these candidates"} submitted
              to client / in the client shortlist.
            </p>
            <div className="space-y-1.5 mb-3 max-h-48 overflow-y-auto">
              {contactsWithEmail.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[13px] cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <input type="checkbox" checked={chosenContactIds.has(c.id)} onChange={() => toggleContact(c.id)} />
                  <span className="flex-1">
                    <span className="font-medium text-slate-800 dark:text-slate-200">{c.full_name}</span>
                    {c.is_primary && <span className="ml-1.5 text-[10px] text-purple-600 font-medium">Primary</span>}
                    <span className="block text-[11px] text-slate-400">{c.email}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEmailModalOpen(false)}
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-[13px] font-medium py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleSendToClient}
                disabled={chosenContactIds.size === 0 || sendingClientEmail}
                className="flex-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[13px] font-medium py-2 disabled:opacity-50"
              >
                {sendingClientEmail ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
      {jdModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setJdModalOpen(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 mb-1">
              Email JD to {selected.size} candidate{selected.size === 1 ? "" : "s"}
            </h3>
            <p className="text-[12px] text-slate-400 mb-3">
              The JD PDF is always attached. Optionally include any of this client&apos;s company
              resources below.
            </p>
            {clientResources.length > 0 ? (
              <div className="space-y-1.5 mb-3 max-h-48 overflow-y-auto">
                {clientResources.map((r) => (
                  <label
                    key={r.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[13px] cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <input type="checkbox" checked={chosenResourceIds.has(r.id)} onChange={() => toggleResource(r.id)} />
                    <span className="flex-1">
                      <span className="font-medium text-slate-800 dark:text-slate-200">{r.name}</span>
                      <span className="ml-1.5 text-[10px] text-slate-400 uppercase">{r.kind}</span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-slate-400 mb-3">
                No company resources added yet for this client -- add some from the client&apos;s page.
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setJdModalOpen(false)}
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-[13px] font-medium py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleEmailJd}
                disabled={emailingJd}
                className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-medium py-2 disabled:opacity-50"
              >
                {emailingJd ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
