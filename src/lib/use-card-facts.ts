"use client";

import { useEffect, useState } from "react";
import type { CardFacts } from "@/app/api/candidates/card-facts/route";

// Cards ask for their facts one by one as they appear; this gathers the asks of the same moment (and the same role text)
// into one request, and remembers the answers so scrolling back or switching tabs costs nothing.
const cache = new Map<string, CardFacts | null>();
const waiting = new Map<string, Set<(f: Record<string, CardFacts>) => void>>();
let queue: { ids: Set<string>; roleText: string } | null = null;

function request(id: string, roleText: string, done: () => void) {
  const key = `${roleText}|${id}`;
  if (cache.has(key)) return done();
  const subs = waiting.get(key) ?? new Set();
  subs.add(() => done());
  waiting.set(key, subs);
  if (!queue || queue.roleText !== roleText) {
    const q = { ids: new Set<string>(), roleText };
    queue = q;
    setTimeout(() => {
      if (queue === q) queue = null;
      const ids = [...q.ids];
      fetch("/api/candidates/card-facts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, roleText: roleText || undefined }) })
        .then((r) => (r.ok ? r.json() : { facts: {} }))
        .catch(() => ({ facts: {} }))
        .then((d: { facts?: Record<string, CardFacts> }) => {
          for (const i of ids) {
            const k = `${roleText}|${i}`;
            cache.set(k, d.facts?.[i] ?? null);
            for (const cb of waiting.get(k) ?? []) cb({});
            waiting.delete(k);
          }
        });
    }, 40);
  }
  queue.ids.add(id);
}

export function useCardFacts(candidateId: string, roleText?: string | null): { facts: CardFacts | null; loading: boolean } {
  const rt = (roleText ?? "").slice(0, 600);
  const key = `${rt}|${candidateId}`;
  const [, bump] = useState(0);
  useEffect(() => {
    if (cache.has(key)) return;
    request(candidateId, rt, () => bump((n) => n + 1));
  }, [candidateId, rt, key]);
  return { facts: cache.get(key) ?? null, loading: !cache.has(key) };
}
