"use client";

import { weekDaysOptions } from "@/lib/candidate-options";

// Off-day picker with two modes:
// - "fixed": specific day(s) always off every week (e.g. Sat+Sun, or just
//   Monday) -- stored in week_off.
// - "rotational": a rotating roster where each person gets N offs per week
//   on a revolving schedule rather than the same fixed day(s) -- stored as
//   rotational_offs_per_week (1 or 2), with an optional mandatory_working_days
//   list for days everyone must work regardless of the roster (e.g. "Sat and
//   Sun are mandatory working days, offs rotate through the other 5").
export type WeekOffValue = {
  week_off_type: "fixed" | "rotational" | "";
  week_off: string[];
  rotational_offs_per_week: 1 | 2 | "";
  mandatory_working_days: string[];
};

export const emptyWeekOffValue: WeekOffValue = {
  week_off_type: "",
  week_off: [],
  rotational_offs_per_week: "",
  mandatory_working_days: [],
};

export default function WeekOffPicker({
  value,
  onChange,
}: {
  value: WeekOffValue;
  onChange: (next: WeekOffValue) => void;
}) {
  function setType(t: "fixed" | "rotational") {
    if (value.week_off_type === t) return;
    onChange({
      week_off_type: t,
      week_off: t === "fixed" ? value.week_off : [],
      rotational_offs_per_week: t === "rotational" ? value.rotational_offs_per_week : "",
      mandatory_working_days: t === "rotational" ? value.mandatory_working_days : [],
    });
  }

  function toggleFixedDay(day: string) {
    onChange({
      ...value,
      week_off: value.week_off.includes(day) ? value.week_off.filter((d) => d !== day) : [...value.week_off, day],
    });
  }

  function toggleMandatoryDay(day: string) {
    onChange({
      ...value,
      mandatory_working_days: value.mandatory_working_days.includes(day)
        ? value.mandatory_working_days.filter((d) => d !== day)
        : [...value.mandatory_working_days, day],
    });
  }

  return (
    <div>
      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">Off day(s)</p>
      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={() => setType("fixed")}
          className={`flex-1 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
            value.week_off_type === "fixed"
              ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
              : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
          }`}
        >
          Fixed days off
        </button>
        <button
          type="button"
          onClick={() => setType("rotational")}
          className={`flex-1 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
            value.week_off_type === "rotational"
              ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
              : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
          }`}
        >
          Rotational off
        </button>
      </div>

      {value.week_off_type === "fixed" && (
        <div className="grid grid-cols-4 gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
          {weekDaysOptions.map((day) => (
            <label key={day} className="flex items-center gap-1.5 text-[12.5px] text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={value.week_off.includes(day)} onChange={() => toggleFixedDay(day)} />
              {day.slice(0, 3)}
            </label>
          ))}
        </div>
      )}

      {value.week_off_type === "rotational" && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 space-y-2.5">
          <div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">Rotational offs per week</p>
            <div className="flex gap-2">
              {([1, 2] as const).map((n) => (
                <label
                  key={n}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] cursor-pointer ${
                    value.rotational_offs_per_week === n
                      ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  <input
                    type="radio"
                    name="rotational_offs_per_week"
                    className="hidden"
                    checked={value.rotational_offs_per_week === n}
                    onChange={() => onChange({ ...value, rotational_offs_per_week: n })}
                  />
                  {n} off{n > 1 ? "s" : ""} / week
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              Mandatory working days (optional -- days everyone must work regardless of the roster, e.g. Saturday &amp; Sunday)
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {weekDaysOptions.map((day) => (
                <label key={day} className="flex items-center gap-1.5 text-[12.5px] text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={value.mandatory_working_days.includes(day)}
                    onChange={() => toggleMandatoryDay(day)}
                  />
                  {day.slice(0, 3)}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
