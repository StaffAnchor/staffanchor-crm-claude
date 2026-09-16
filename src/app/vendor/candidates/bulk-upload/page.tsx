import { createClient } from "@/lib/supabase/server";
import VendorBulkUploadView from "./vendor-bulk-upload-view";
import type { VendorMandate } from "../../mandates/page";
import { friendlyVendorError } from "@/lib/friendly-error";

// Vendor equivalent of the internal /candidates/bulk-upload flow, reusing
// the same "extract with AI, review, then save" shape -- but scoped to a
// single mandate the vendor is assigned to (required, since every vendor
// candidate has to land inside a candidate_mandate_links row same as a
// manual single submission would) and saved through vendor_submit_candidate()
// per row rather than the staff-only /api/candidate-create route.
export default async function VendorBulkUploadPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_vendor_mandates");
  const mandates: VendorMandate[] = (error ? [] : data ?? []) as VendorMandate[];

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-6">
      <h1 className="text-[20px] font-semibold text-slate-900">Bulk Upload</h1>
      <p className="text-[13px] text-slate-500 mt-0.5 mb-5">
        Upload up to 10 resumes at once for one mandate -- we&apos;ll read each one and pre-fill the details for you
        to check before saving.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          {friendlyVendorError(error.message, "vendor-bulk-upload")}
        </div>
      )}

      {mandates.length === 0 && !error ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-16 flex flex-col items-center justify-center text-center">
          <p className="text-[13px] text-slate-500">
            You need to be assigned to a mandate before you can bulk upload candidates.
          </p>
        </div>
      ) : (
        <VendorBulkUploadView mandates={mandates.map((m) => ({ id: m.mandate_id, label: `${m.role_title} · ${m.client_display}` }))} />
      )}
    </div>
  );
}
