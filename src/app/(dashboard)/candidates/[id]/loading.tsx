export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse space-y-4 p-6">
      <div className="h-7 w-1/3 rounded bg-slate-200" />
      <div className="h-4 w-1/2 rounded bg-slate-100" />
      <div className="h-24 rounded-xl bg-slate-100" />
      <div className="h-64 rounded-xl bg-slate-100" />
    </div>
  );
}
