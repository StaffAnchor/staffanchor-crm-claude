"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OpenRole } from "@/lib/hiring-board";

export default function Picker({ roles }: { roles: OpenRole[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 6 ? p : [...p, id]));
  return (
    <div className="mt-5">
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
        {roles.length === 0 && <li className="px-4 py-6 text-[14px] text-slate-500">No open roles.</li>}
        {roles.map((r) => (
          <li key={r.id}>
            <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60">
              <input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} className="h-4 w-4" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-slate-900 dark:text-slate-100">{r.title}</span>
                <span className="block truncate text-[12px] text-slate-500">{[r.client, r.city].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="shrink-0 text-right text-[12px] text-slate-500">
                {r.suggestions} suggested
                <br />
                {r.inPipeline} in pipeline
              </span>
            </label>
          </li>
        ))}
      </ul>
      <button
        disabled={!picked.length}
        onClick={() => router.push(`/hiring?m=${picked.join(",")}`)}
        className="mt-4 rounded-lg bg-teal-600 px-5 py-2 text-[14px] font-semibold text-white hover:bg-teal-700 disabled:opacity-40"
      >
        Open the board{picked.length ? ` (${picked.length})` : ""}
      </button>
    </div>
  );
}
