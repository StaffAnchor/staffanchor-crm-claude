// See candidates/layout.tsx for the reasoning -- the sidebar duplicated
// the status filters already on this page and was meaningless on the
// mandate detail page.
export default function MandatesLayout({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[1400px] mx-auto px-6 py-6">{children}</div>;
}
