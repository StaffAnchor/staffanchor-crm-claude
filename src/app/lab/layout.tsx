import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sales Leaders Lab | StaffAnchor", robots: { index: false, follow: false } };

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#F5F6F8] text-slate-900 dark:bg-slate-950 dark:text-slate-100">{children}</div>;
}
