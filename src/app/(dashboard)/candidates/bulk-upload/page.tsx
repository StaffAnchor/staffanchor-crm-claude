import { createClient } from "@/lib/supabase/server";
import BulkUploadView from "./bulk-upload-view";

export default async function BulkUploadPage() {
  const supabase = await createClient();
  // Open/draft mandates only -- a closed mandate isn't something you'd be
  // sourcing fresh candidates for. Optional linking (see bulk-upload-view.tsx):
  // a batch might be sourced for one specific mandate, or just general
  // pipeline-building with no mandate in mind yet.
  const { data: mandates } = await supabase
    .from("mandates")
    .select("id, role_title, client_name")
    .in("status", ["open", "draft"])
    .order("created_at", { ascending: false })
    .limit(300);

  return (
    <div className="max-w-4xl">
      <div className="mb-4">
        <h1 className="text-[20px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight">Bulk CV Upload</h1>
        <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
          Drop in up to 10 resumes downloaded from a job portal or LinkedIn. We&apos;ll pull out the basics for you to
          review before anything is saved.
        </p>
      </div>
      <BulkUploadView mandates={mandates ?? []} />
    </div>
  );
}
