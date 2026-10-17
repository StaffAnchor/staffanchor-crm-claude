"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LEVEL_OPTIONS } from "@/lib/role-type";

export type ClusterOption = { slug: string; name: string; track: string; family: string };

const TRACK_LABEL: Record<string, string> = { b2b_sales: "B2B sales", b2c_sales: "B2C sales", non_sales: "Non-sales" };

/** The kinds of job the system knows, for the role type picker. */
export function useRoleClusters(): ClusterOption[] {
  const [rows, setRows] = useState<ClusterOption[]>([]);
  useEffect(() => {
    let alive = true;
    createClient()
      .from("role_clusters")
      .select("slug, name, track, family, sort_order")
      .neq("slug", "other_role")
      .order("sort_order")
      .then(({ data }) => alive && setRows((data ?? []) as ClusterOption[]));
    return () => {
      alive = false;
    };
  }, []);
  return rows;
}

export function RoleTypeSelect({ value, onChange, clusters, className = "" }: { value: string; onChange: (v: string) => void; clusters: ClusterOption[]; className?: string }) {
  const tracks = Array.from(new Set(clusters.map((c) => c.track)));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">Choose the role type…</option>
      {tracks.map((t) => (
        <optgroup key={t} label={TRACK_LABEL[t] ?? t}>
          {clusters
            .filter((c) => c.track === t)
            .map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

export function RoleLevelSelect({ value, onChange, className = "" }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">Choose the level…</option>
      {LEVEL_OPTIONS.map((l) => (
        <option key={l.value} value={l.value}>
          {l.label}
        </option>
      ))}
    </select>
  );
}
