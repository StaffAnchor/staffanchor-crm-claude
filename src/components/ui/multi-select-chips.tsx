"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";

// Small reusable multi-select for long option lists (industries, languages,
// etc.) -- a search box narrows a scrollable checkbox list, selected values
// show as removable chips above it. Used anywhere a mandate form needs to
// pick several values from a shared option set.
export default function MultiSelectChips({
  options,
  selected,
  onChange,
  placeholder = "Search...",
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  const labelFor = (value: string) => options.find((o) => o.value === value)?.label ?? value;

  return (
    <div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {selected.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[12px] px-2.5 py-1"
            >
              {labelFor(v)}
              <button type="button" onClick={() => toggle(v)} className="text-slate-400 hover:text-red-600">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm mb-1.5"
      />
      <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 p-2 space-y-0.5">
        {filtered.length === 0 && <p className="text-[12px] text-slate-400 px-1 py-1">No matches.</p>}
        {filtered.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-[13px] text-slate-700 dark:text-slate-300 px-1 py-0.5">
            <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}
