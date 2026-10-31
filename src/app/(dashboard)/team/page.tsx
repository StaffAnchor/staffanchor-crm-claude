import Link from "next/link";
import TeamSection from "./section";
import VendorsSection from "../vendors/section";

// Team (staff accounts, roles, specialties) and Vendors (partner agencies) in one place: vendors used to be a separate menu item with no accounts behind it.
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  const view = sp.view === "vendors" ? "vendors" : "team";
  return (
    <>
      <div className="mx-auto flex max-w-[1400px] items-center gap-1 px-6 pt-5">
        {([{ key: "team", label: "People" }, { key: "vendors", label: "Vendors" }] as const).map((v) => (
          <Link key={v.key} href={v.key === "team" ? "/team" : "/team?view=vendors"} className={`rounded-full px-3 py-1 text-[12.5px] font-medium ${view === v.key ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"}`}>
            {v.label}
          </Link>
        ))}
      </div>
      {view === "vendors" ? <VendorsSection /> : <TeamSection />}
    </>
  );
}
