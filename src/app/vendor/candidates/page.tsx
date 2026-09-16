import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { friendlyVendorError } from "@/lib/friendly-error";
import VendorCandidatesTable, { type VendorCandidateRow } from "./vendor-candidates-table";

// A vendor's "own database" -- every candidate they've personally
// submitted, across every mandate, shown the same way the internal
// Candidates page shows a recruiter's pipeline (search, resume
// preview/download, click into a profile) rather than the flat status
// list on My Submissions. RLS + get_my_vendor_candidates() both scope
// this to created_by_user = auth.uid() -- a vendor can never see another
// agency's or a recruiter's candidates here, even ones on a shared
// mandate.
export default async function VendorCandidatesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_vendor_candidates");
  const rows: VendorCandidateRow[] = (error ? [] : data ?? []) as VendorCandidateRow[];

  const resumePaths = rows.map((r) => r.resume_file_url).filter((p): p is string => !!p);
  const signedUrlByPath = new Map<string, string>();
  if (resumePaths.length > 0) {
    const { data: signed } = await supabase.storage.from("resumes").createSignedUrls(resumePaths, 60 * 60 * 12);
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path) signedUrlByPath.set(s.path, s.signedUrl);
    }
  }

  return (
    <div className="max-w-[1300px] mx-auto px-5 py-6">
      <div className="flex items-start justify-between gap-4 mb-0.5">
        <h1 className="text-[20px] font-semibold text-slate-900">My Candidates</h1>
        <Link
          href="/vendor/candidates/bulk-upload"
          className="shrink-0 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-[13px] font-medium px-3.5 py-2"
        >
          + Bulk upload
        </Link>
      </div>
      <p className="text-[13px] text-slate-500 mt-0.5 mb-5">
        {rows.length === 0
          ? "Candidates you submit will show up here -- your own database, separate from anyone else's."
          : `${rows.length} candidate${rows.length === 1 ? "" : "s"} in your database, across all mandates`}
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          {friendlyVendorError(error.message, "vendor-candidates-list")}
        </div>
      )}

      {rows.length === 0 && !error ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-16 flex flex-col items-center justify-center text-center">
          <p className="text-[13px] text-slate-500">
            Head to My Mandates to submit your first candidate, or use Bulk Upload to add several at once.
          </p>
        </div>
      ) : (
        <VendorCandidatesTable rows={rows} signedUrlByPath={Object.fromEntries(signedUrlByPath)} />
      )}
    </div>
  );
}
