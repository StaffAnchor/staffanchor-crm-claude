"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users, Plus, Trash2, Loader2, Pencil, Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  createdByName: string | null;
  count: number;
};

export default function GroupsView({ groups }: { groups: GroupRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Rename was the one thing you couldn't do to a saved group after
  // creating it -- only create/delete existed, so a group named too
  // narrowly (or with a typo) had to be deleted and rebuilt from scratch,
  // losing its membership in the process.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from("candidate_groups").insert({
      name: name.trim(),
      description: description.trim() || null,
      created_by: user?.id ?? null,
    });
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setCreating(false);
    setName("");
    setDescription("");
    router.refresh();
  }

  function startRename(g: GroupRow) {
    setRenamingId(g.id);
    setRenameValue(g.name);
  }

  async function handleRename(id: string) {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    setRenameBusy(true);
    const { error: updateError } = await supabase.from("candidate_groups").update({ name: trimmed }).eq("id", id);
    setRenameBusy(false);
    if (updateError) {
      window.alert(`Couldn't rename: ${updateError.message}`);
      return;
    }
    setRenamingId(null);
    router.refresh();
  }

  async function handleDelete(id: string, groupName: string) {
    if (!window.confirm(`Delete "${groupName}"? This only removes the saved group, not the candidates themselves.`)) return;
    const { error: deleteError } = await supabase.from("candidate_groups").delete().eq("id", id);
    if (deleteError) {
      window.alert(`Couldn't delete: ${deleteError.message}`);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {!creating ? (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-medium px-3.5 py-2 shadow-sm transition-all duration-200 ease-ros"
        >
          <Plus className="w-3.5 h-3.5" /> New group
        </button>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-ros-lg p-4 shadow-ros-sm space-y-2.5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group name (e.g. B2B AEs shortlisted for DDP)"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[13px]"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12.5px]"
          />
          {error && <p className="text-[12px] text-rose-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={!name.trim() || busy}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[12.5px] font-medium px-3 py-1.5"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setError(null);
              }}
              className="text-[12.5px] font-medium text-slate-500 hover:text-slate-800 px-3 py-1.5"
            >
              Cancel
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            Groups start empty -- add candidates to it from the Candidates table by selecting rows and choosing
            &quot;Add to group.&quot;
          </p>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-ros-lg p-8 text-center">
          <Users className="w-6 h-6 text-slate-300 mx-auto mb-2" />
          <p className="text-[13px] text-slate-500">No saved groups yet.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-ros-lg shadow-ros-sm divide-y divide-slate-100 dark:divide-slate-800">
          {groups.map((g) =>
            renamingId === g.id ? (
              <div key={g.id} className="flex items-center gap-2 px-4 py-3">
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(g.id);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  className="flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[13px]"
                />
                <button
                  type="button"
                  onClick={() => handleRename(g.id)}
                  disabled={!renameValue.trim() || renameBusy}
                  className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40 shrink-0"
                  title="Save"
                >
                  {renameBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setRenamingId(null)}
                  className="text-slate-400 hover:text-slate-700 shrink-0"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div key={g.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <Link href={`/candidates/groups/${g.id}`} className="min-w-0 flex-1 group">
                  <p className="text-[13.5px] font-medium text-slate-800 dark:text-slate-100 group-hover:text-blue-600 truncate">
                    {g.name} <span className="text-slate-400 font-normal">({g.count})</span>
                  </p>
                  {g.description && <p className="text-[12px] text-slate-400 truncate">{g.description}</p>}
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {g.createdByName ? `Created by ${g.createdByName} · ` : ""}
                    {new Date(g.createdAt).toLocaleDateString()}
                  </p>
                </Link>
                <button
                  type="button"
                  onClick={() => startRename(g)}
                  className="text-slate-300 hover:text-blue-600 shrink-0"
                  title="Rename group"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(g.id, g.name)}
                  className="text-slate-300 hover:text-rose-600 shrink-0"
                  title="Delete group"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
