import ClientAcquisitionSubNav from "./client-acquisition-sub-nav";

// Consolidation pass: Sales and Employer Inquiries are the same underlying
// job -- bringing in new client business, just at two different stages
// (an inbound inquiry that hasn't been qualified yet vs. a lead already
// being actively worked) -- so they're folded into one "Client
// Acquisition" section with a shared sub-nav, same pattern as the
// Analytics consolidation (see (dashboard)/analytics/layout.tsx), minus
// the admin gate: both pages stay visible to every recruiter/partner, same
// as before this move.
export default function ClientAcquisitionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="border-b border-slate-100 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40">
        <div className="max-w-[1500px] mx-auto px-5 pt-5">
          <h1 className="text-ros-display font-semibold tracking-tight text-slate-900 dark:text-slate-100">Client Acquisition</h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1 mb-4">
            The sales pipeline and the inbound inquiry queue that feeds it -- one place for bringing in new business.
          </p>
          <ClientAcquisitionSubNav />
        </div>
      </div>
      {children}
    </div>
  );
}
