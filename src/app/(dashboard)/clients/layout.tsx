import SectionShell, { type SidebarGroup } from "../section-shell";

const groups: SidebarGroup[] = [
  {
    heading: "Views",
    items: [{ label: "All Clients", href: "/clients", icon: "Building2" }],
  },
];

export default function ClientsLayout({ children }: { children: React.ReactNode }) {
  return (
    <SectionShell basePath="/clients" groups={groups}>
      {children}
    </SectionShell>
  );
}
