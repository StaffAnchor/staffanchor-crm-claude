"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";

export type JdFileData = {
  text: string;
  company_names: string[];
  role_title: string;
  cities: string[];
  experience_min: string;
  experience_max: string;
  budget_min: string;
  budget_max: string;
};

// "Upload the client's JD" button: sends the file for reading and hands the text and basic facts back. The company's name is
// kept so the generated listing can leave it out.
export default function JdFilePicker({ onLoaded }: { onLoaded: (data: JdFileData, fileName: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  async function pick(file: File | undefined) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/jd-from-file", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't read that file.");
      setFileName(file.name);
      onLoaded(data as JdFileData, file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="mb-2">
      <input ref={input} type="file" accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-lg border border-teal-300 bg-white px-3 py-1.5 text-[12px] font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-50"
      >
        <FileUp className="w-3.5 h-3.5" /> {busy ? "Reading the file..." : "Upload the client's JD (PDF, Word, text or photo)"}
      </button>
      {fileName && !error && <p className="mt-1 text-[11.5px] text-slate-500">Loaded {fileName}. Check the notes below, then generate.</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
