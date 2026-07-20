"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
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
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Clear the search box each time the dropdown re-opens, and focus it
  // immediately -- a recruiter opening "Current location" with 200+ cities
  // in it should be able to start typing right away rather than having to
  // click into a search box first.
  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  function toggle(opt: string) {
    setSelected((prev) => (prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]));
  }

  const resolvedGroups: OptionGroup[] = groups ?? (options ? [{ group: "", options }] : []);
  const totalOptionCount = resolvedGroups.reduce((n, g) => n + g.options.length, 0);

  // Only worth showing a search box once there's actually enough options to
  // need one -- a 3-option filter (e.g. Work mode) doesn't need it.
  const showSearch = totalOptionCount > 8;

  const filteredGroups = useMemo(() => {
    if (!query.trim()) return resolvedGroups;
    const q = query.trim().toLowerCase();
    return resolvedGroups
      .map((g) => ({
        ...g,
        options: g.options.filter((opt) => (labels?.[opt] ?? opt).toLowerCase().includes(q)),
      }))
      .filter((g) => g.options.length > 0);
  }, [resolvedGroups, query, labels]);

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
        <div className="absolute z-20 mt-1 w-64 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-ros-md">
          {showSearch && (
            <div className="sticky top-0 z-10 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${label.toLowerCase()}...`}
                  className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 py-1 pl-6 pr-2 text-ros-body-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
            </div>
          )}
          <div className="max-h-64 overflow-y-auto py-1.5">
          {filteredGroups.length === 0 && (
            <p className="px-3 py-2 text-ros-body-sm text-slate-400">No matches for &quot;{query}&quot;</p>
          )}
          {filteredGroups.map((g) => (
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
        </div>
      )}
      <p className="sr-only" aria-label={label} />
    </div>
  );
}
