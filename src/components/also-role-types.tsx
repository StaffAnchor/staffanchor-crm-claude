"use client";

import { X } from "lucide-react";
import { RoleTypeSelect, type ClusterOption } from "@/components/role-type-fields";

/** Extra role types that count as a full fit for a mandate, beside the main one. Shown as removable chips. */
export default function AlsoRoleTypes({ value, onChange, clusters, main, disabled }: { value: string[]; onChange: (v: string[]) => void; clusters: ClusterOption[]; main: string; disabled?: boolean }) {
  const name = (slug: string) => clusters.find((c) => c.slug === slug)?.name ?? slug;
  const available = clusters.filter((c) => c.slug !== main && !value.includes(c.slug));
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((s) => (
          <span key={s} className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800 ring-1 ring-teal-200 dark:bg-teal-950/30 dark:text-teal-200 dark:ring-teal-800">
            {name(s)}
            <button type="button" disabled={disabled} onClick={() => onChange(value.filter((x) => x !== s))} aria-label={`Remove ${name(s)}`} className="text-teal-600 hover:text-teal-900">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {value.length < 4 && (
          <RoleTypeSelect
            value=""
            onChange={(v) => v && onChange([...value, v])}
            clusters={available}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900"
          />
        )}
      </div>
    </div>
  );
}
