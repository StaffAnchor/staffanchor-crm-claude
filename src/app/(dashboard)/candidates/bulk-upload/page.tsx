import BulkUploadView from "./bulk-upload-view";

export default function BulkUploadPage() {
  return (
    <div className="max-w-4xl">
      <div className="mb-4">
        <h1 className="text-[20px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight">Bulk CV Upload</h1>
        <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
          Drop in up to 10 resumes downloaded from a job portal or LinkedIn. We&apos;ll pull out the basics for you to
          review before anything is saved.
        </p>
      </div>
      <BulkUploadView />
    </div>
  );
}
