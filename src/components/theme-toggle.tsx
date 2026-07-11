"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

// Reads/writes a single localStorage key so the choice survives reloads;
// falls back to the OS-level prefers-color-scheme the first time a visitor
// shows up with nothing stored yet. See the inline script in
// src/app/layout.tsx for the pre-hydration equivalent of this same logic
// (applied synchronously so there's no flash of the wrong theme on load).
const STORAGE_KEY = "ros-theme";

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
}

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // localStorage unavailable (private browsing, etc.) -- theme just
      // won't persist across reloads, which is a fine degradation.
    }
  }

  // Avoid rendering the (potentially wrong) icon before we've read the
  // real class off <html> post-hydration.
  if (!mounted) {
    return <span className="w-8 h-8 shrink-0" aria-hidden />;
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={dark}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="ros-focusable flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors duration-200"
    >
      {dark ? <Sun className="w-4 h-4" strokeWidth={2} /> : <Moon className="w-4 h-4" strokeWidth={2} />}
    </button>
  );
}
