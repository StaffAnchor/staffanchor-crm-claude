// See candidates/layout.tsx for the reasoning -- this sidebar was just a
// single link back to the page it was already on.
export default function ClientsLayout({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[1400px] mx-auto px-6 py-6">{children}</div>;
}
