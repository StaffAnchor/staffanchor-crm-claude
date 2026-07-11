// The per-section left sidebar (SectionShell) used to duplicate the exact
// same status filters already shown as stat tiles / chips on this page's
// own content, and made zero sense on the candidate detail page (you're
// not filtering a list when looking at one person). Removed in favor of
// full-width content -- the top nav already handles section switching.
export default function CandidatesLayout({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[1400px] mx-auto px-6 py-6">{children}</div>;
}
