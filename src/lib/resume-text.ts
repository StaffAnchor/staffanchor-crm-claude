import mammoth from "mammoth";

// pdf-parse bundles its own ancient, pinned copy of pdf.js (v1.10.100, from
// ~2017) with no escape hatch for malformed-but-real PDFs -- several
// candidate resumes (confirmed: a ReportLab-generated PDF, "bad XRef entry")
// throw a hard FormatError there even though the file opens fine in any
// real PDF viewer and even in modern parsers (pypdf, pdfjs-dist). Rather
// than silently telling the recruiter "only PDF/DOCX supported" (misleading
// -- the file WAS a PDF, this specific ancient parser just choked on it),
// fall back to pdfjs-dist (actively maintained, far more tolerant of
// non-standard xref tables) whenever the fast path fails.
async function extractPdfTextViaPdfParse(buffer: ArrayBuffer): Promise<string | null> {
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
  const result = await pdfParse(Buffer.from(buffer));
  return result.text?.trim() || null;
}

async function extractPdfTextViaPdfjs(buffer: ArrayBuffer): Promise<string | null> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => ("str" in item ? item.str : "")).join(" ") + "\n";
  }
  return text.trim() || null;
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
      console.error("pdf-parse failed, falling back to pdfjs-dist", err);
      try {
        return await extractPdfTextViaPdfjs(buffer);
      } catch (fallbackErr) {
        console.error("pdfjs-dist fallback also failed", fallbackErr);
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
