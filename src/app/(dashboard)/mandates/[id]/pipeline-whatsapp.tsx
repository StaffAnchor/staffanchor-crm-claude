"use client";

import WhatsAppMenu from "@/components/whatsapp-menu";
import { pipelineTemplates } from "@/lib/whatsapp-link";
import { useMyFirstName } from "@/lib/use-my-name";

// The WhatsApp menu on a pipeline row: messages that fit this person's stage on this role, signed with
// the name of whoever is logged in.
export default function PipelineWhatsApp({
  candidateId,
  candidateName,
  phone,
  missing,
  stage,
  roleTitle,
  cities,
  workMode,
  className,
}: {
  candidateId: string;
  candidateName: string;
  phone: string | null | undefined;
  missing?: string[] | null;
  stage: string;
  roleTitle: string | null | undefined;
  cities?: string[] | null;
  workMode?: string | null;
  className?: string;
}) {
  const me = useMyFirstName();
  return (
    <WhatsAppMenu
      phone={phone}
      templates={pipelineTemplates(candidateName, { me, candidateId, missing: missing ?? [], role: roleTitle ?? null, stage, cities, workMode })}
      className={className ?? "inline-flex items-center gap-1 rounded-ros-md bg-slate-100 px-2 py-1 text-[11.5px] font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"}
    />
  );
}
