"use client";

// A fact we do not have yet. Instead of a blank dash it says what to do, and one click opens the right channel.
export default function GapChip({ label = "Ask for it" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("profile-open-panel", { detail: { panel: "message", tab: "official" } }))}
      className="mt-0.5 text-[13.5px] font-medium text-amber-700 underline decoration-amber-300 underline-offset-2 hover:text-amber-800 dark:text-amber-300"
    >
      {label}
    </button>
  );
}
