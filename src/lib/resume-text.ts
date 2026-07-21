import mammoth from "mammoth";

// pdf-parse bundles its own ancient, pinned copy of pdf.js (v1.10.100, from
// ~2017) with no escape hatch for malformed-but-real PDFs -- several
// candidate resumes (confirmed: a ReportLab-generated PDF, "bad XRef entry")
// throw a hard FormatError there even though the file opens fine in any
// real PDF viewer and even in modern parsers (pypdf, unpdf). Rather than
// silently telling the recruiter "only PDF/DOCX supported" (misleading --
// the file WAS a PDF, this specific ancient parser just choked on it), fall
// back to unpdf whenever the fast path fails.
//
// First attempt at this fallback used raw pdfjs-dist directly, which failed
// in production with "Setting up fake worker failed: Cannot find module
// .../pdf.worker.mjs" -- pdfjs-dist's Node path still tries to dynamically
// resolve its worker script relative to wherever Turbopack bundled its code
// into a serverless chunk, and that worker file never ships in that chunk.
// unpdf exists specifically to solve this: it's built for serverless/edge
// runtimes and patches pdfjs-dist internally to run fully worker-free, so
// there's no external file for the bundler to lose track of. Verified
// locally against the exact failing file before shipping.
async function extractPdfTextViaPdfParse(buffer: ArrayBuffer): Promise<string | null> {
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
  const result = await pdfParse(Buffer.from(buffer));
  return result.text?.trim() || null;
}

async function extractPdfTextViaUnpdf(buffer: ArrayBuffer): Promise<string | null> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(doc, { mergePages: true });
  return text?.trim() || null;
}

// Extracts plain text from a resume file buffer so it can be fed into the AI
// summary prompt. Supports the two formats candidates actually upload (PDF,
// DOCX). Returns null (rather than throwing) on anything unexpected -- a
// resume that fails to parse should degrade to "no resume text available",
// not break summary generation entirely.
export async function extractResumeText(buffer: ArrayBuffer, fileName: string): Promise<string | null> {
  if (/\.pdf$/i.test(fileName)) {
    try {
      return await extractPdfTextViaPdfParse(buffer);
    } catch (err) {
      console.error("pdf-parse failed, falling back to unpdf", err);
      try {
        return await extractPdfTextViaUnpdf(buffer);
      } catch (fallbackErr) {
        console.error("unpdf fallback also failed", fallbackErr);
        return null;
      }
    }
  }
  if (/\.docx$/i.test(fileName)) {
    try {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
      return result.value?.trim() || null;
    } catch (err) {
      console.error("Resume text extraction failed", err);
      return null;
    }
  }
  return null;
}
