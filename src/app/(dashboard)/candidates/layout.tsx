import { Users, Clock, Eye, Star, Send, Archive } from "lucide-react";
import SectionShell, { type SidebarGroup } from "../section-shell";

const groups: SidebarGroup[] = [
  {
    heading: "Views",
    items: [
      { label: "All Candidates", href: "/candidates", icon: Users },
      { label: "Awaiting Input", href: "/candidates?status=awaiting_input", icon: Clock, matchParam: { key: "status", value: "awaiting_input" } },
      { label: "Under Review", href: "/candidates?status=under_review", icon: Eye, matchParam: { key: "status", value: "under_review" } },
      { label: "Shortlisted", href: "/candidates?status=shortlisted", icon: Star, matchParam: { key: "status", value: "shortlisted" } },
      { label: "Submitted", href: "/candidates?status=submitted", icon: Send, matchParam: { key: "status", value: "submitted" } },
      { label: "Inactive", href: "/candidates?status=inactive", icon: Archive, matchParam: { key: "status", value: "inactive" } },
    ],
  },
];

export default function CandidatesLayout({ children }: { children: React.ReactNode }) {
  return (
    <SectionShell basePath="/candidates" groups={groups}>
      {children}
    </SectionShell>
  );
}
