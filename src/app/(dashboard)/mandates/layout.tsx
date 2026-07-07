import SectionShell, { type SidebarGroup } from "../section-shell";

const groups: SidebarGroup[] = [
  {
    heading: "Views",
    items: [
      { label: "All Mandates", href: "/mandates", icon: "Briefcase" },
      { label: "Open", href: "/mandates?status=open", icon: "CheckCircle2", matchParam: { key: "status", value: "open" } },
      { label: "On Hold", href: "/mandates?status=on_hold", icon: "PauseCircle", matchParam: { key: "status", value: "on_hold" } },
      { label: "Closed", href: "/mandates?status=closed", icon: "XCircle", matchParam: { key: "status", value: "closed" } },
    ],
  },
];

export default function MandatesLayout({ children }: { children: React.ReactNode }) {
  return (
    <SectionShell basePath="/mandates" groups={groups}>
      {children}
    </SectionShell>
  );
}
