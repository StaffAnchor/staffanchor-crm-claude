"use client";

import { useEffect, useState } from "react";

export type TemplateFlags = { details: boolean; opportunity: boolean; interview: boolean; offer: boolean; reactivation: boolean; referral: boolean; referralRole: boolean };

let cached: TemplateFlags | undefined;
let inflight: Promise<TemplateFlags | null> | null = null;

/** Which approved WhatsApp templates are set up. Null until known, so buttons stay hidden rather than flicker. */
export function useWhatsAppTemplates(): TemplateFlags | null {
  const [flags, setFlags] = useState<TemplateFlags | null>(cached ?? null);
  useEffect(() => {
    if (cached) return;
    let alive = true;
    inflight ??= fetch("/api/whatsapp/templates-status")
      .then((r) => (r.ok ? (r.json() as Promise<TemplateFlags>) : null))
      .catch(() => null);
    void inflight.then((f) => {
      if (f) cached = f;
      if (alive && f) setFlags(f);
    });
    return () => {
      alive = false;
    };
  }, []);
  return flags;
}
