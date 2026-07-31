"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Mail, FolderPlus, Send } from "lucide-react";
import { STAGES, applyStageChange, type Stage } from "@/lib/mandate-stage";
import type { MandateCandidateRow } from "./mandate-candidates-table";

// Shared bulk-action bar (+ its 3 modals: Add to group / Email to Client /
// Email JD) used from BOTH the Table view (mandate-candidates-table.tsx) and
// the Board view (mandate-candidates-board.tsx), so selecting candidates and
// acting on them in bulk works identically no matter which layout a
// recruiter happens to be looking at. Each host component owns its own
// `rows`/`selected`/`message` state and just hands them down here -- this
// component only touches those via the setters it's given, and never
// maintains a second copy of the candidate list.
const STAGE_ORDER = STAGES.reduce<Record<string, number>>((acc, s, i) => ({ ...acc, [s]: i }), {});

type Message = { type: "success" | "error"; text: string } | null;

export default function MandateBulkActionsBar({
  rows,
  setRows,
  selected,
  setSelected,
  setMessage,
  mandateContext,
}: {
  rows: MandateCandidateRow[];
  setRows: React.Dispatch<React.SetStateAction<MandateCandidateRow[]>>;
  selected: Set<string>;
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  setMessage: (m: Message) => void;
  mandateContext: { mandateId: string; role_title: string; client_name: string; [key: string]: unknown };
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [emailingJd, setEmailingJd] = useState(false);

  const clientContacts =
    (mandateContext.clientContacts as { id: string; full_name: string; email: string | null; is_primary: boolean }[]) ?? [];
  const contactsWithEmail = clientContacts.filter((c) => c.email);
  const clientResources =
    (mandateContext.clientResources as { id: string; kind: "link" | "file"; name: string; url: string | null }[]) ?? [];

  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [existingGroups, setExistingGroups] = useState<{ id: string; name: string }[] | null>(null);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [chosenGroupId, setChosenGroupId] = useState("");
  const [newGroupName, setNewGroupName] = useState("");

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [chosenContactIds, setChosenContactIds] = useState<Set<string>>(new Set());
  const [sendingClientEmail, setSendingClientEmail] = useState(false);

  const [jdModalOpen, setJdModalOpen] = useState(false);
  const [chosenResourceIds, setChosenResourceIds] = useState<Set<string>>(new Set());

  async function syncStageForShortlist(row: MandateCandidateRow, addingToShortlist: boolean) {
    const newStage: Stage = addingToShortlist ? "submitted" : "pulled_back";
    if (addingToShortlist && (STAGE_ORDER[row.stage] ?? 0) >= STAGE_ORDER["submitted"]) return;
    if (!addingToShortlist && row.stage === "pulled_back") return;
    try {
      await applyStageChange(supabase, {
        linkId: row.id,
        candidateId: row.candidate.id,
        mandateId: mandateContext.mandateId,
        candidateName: row.candidate.full_name,
        mandateLabel: `${mandateContext.role_title} — ${mandateContext.client_name}`,
        previousStage: row.stage,
        newStage,
        source: "recruiter",
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, stage: newStage, stage_source: "recruiter" } : r)));
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Failed to sync stage with shortlist status." });
    }
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

  function openEmailModal() {
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

  if (selected.size === 0) return null;

  return (
    <>
      <div className="flex items-center justify-between gap-3 bg-slate-900 px-4 py-2.5 text-sm text-white rounded-xl mb-3">
        <span>{selected.size} selected</span>
        <div className="flex gap-2 flex-wrap justify-end">
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
    </>
  );
}
