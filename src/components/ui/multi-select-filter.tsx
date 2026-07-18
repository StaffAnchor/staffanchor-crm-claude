"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

// Dropdown-with-checkboxes filter control -- lets a recruiter pick "Team
// Lead" + "Manager" + "Sr Manager" in one filter instead of the native
// single-value <select> forcing one-value-at-a-time. Deliberately built to
// slot into the existing server-rendered GET-form filter panel unchanged:
// this writes its selection into a hidden <input name=...> with a
// comma-joined value, so the surrounding <form> and the page's existing
// applyFilters()/qs() logic only need to switch from .eq() to .in() on a
// comma-split array -- no rewrite of the filter architecture itself.
//
// Supports either a flat option list or grouped options (for Primary
// Specialization's B2B/B2C/Non-Sales grouping) via the `groups` prop.

type OptionGroup = { group: string; options: string[] };

export function MultiSelectFilter({
  name,
  label,
  options,
  groups,
  defaultValue,
  labels,
}: {
  name: string;
  label: string;
  options?: string[];
  groups?: OptionGroup[];
  defaultValue?: string;
  /** Optional value -> display-label map, for fields whose stored value is a
      code (e.g. status="under_review") but the UI should show a readable
      label ("Under Review"). Selection/query values remain the raw codes. */
  labels?: Record<string, string>;
}) {
  const [selected, setSelected] = useState<string[]>(
    defaultValue ? defaultValue.split(",").filter(Boolean) : []
  );
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function toggle(opt: string) {
    setSelected((prev) => (prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]));
  }

  const resolvedGroups: OptionGroup[] = groups ?? (options ? [{ group: "", options }] : []);

  return (
    <div ref={rootRef} className="relative">
      {/* The actual value the surrounding <form> submits -- everything
          above is just UI for building this one comma-joined string. */}
      <input type="hidden" name={name} value={selected.join(",")} />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-ros-body-sm bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 min-w-[140px]"
      >
        <span className="flex-1 text-left truncate">
          {selected.length === 0
            ? "Any"
            : selected.length === 1
            ? labels?.[selected[0]] ?? selected[0]
            : `${selected.length} selected`}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-64 max-h-72 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-ros-md py-1.5">
          {resolvedGroups.map((g) => (
            <div key={g.group || "flat"} className="px-1.5">
              {g.group && (
                <p className="text-ros-caption font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1.5 pt-2 pb-1">
                  {g.group}
                </p>
              )}
              {g.options.map((opt) => {
                const active = selected.includes(opt);
                return (
                  <label
                    key={opt}
                    className={cn(
                      "flex items-center gap-2 px-1.5 py-1 rounded-md text-ros-body-sm cursor-pointer",
                      active
                        ? "text-blue-700 dark:text-blue-300"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => toggle(opt)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                    />
                    {labels?.[opt] ?? opt}
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <p className="sr-only" aria-label={label} />
    </div>
  );
}
