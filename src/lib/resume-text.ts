import mammoth from "mammoth";

// Extracts plain text from a resume file buffer so it can be fed into the AI
// summary prompt. Supports the two formats candidates actually upload (PDF,
// DOCX). Returns null (rather than throwing) on anything unexpected -- a
// resume that fails to parse should degrade to "no resume text available",
// not break summary generation entirely.
export async function extractResumeText(buffer: ArrayBuffer, fileName: string): Promise<string | null> {
  try {
    if (/\.pdf$/i.test(fileName)) {
      // Importing the package root (pdf-parse/index.js) runs a debug-mode
      // branch on load that tries to synchronously read a hardcoded sample
      // file ("./test/data/05-versions-space.pdf") whenever it can't detect
      // module.parent -- which is always the case once bundled by
      // Next.js/Turbopack, so every PDF extraction was silently failing in
      // production (ENOENT) despite candidates having resumes on file.
      // Importing the inner lib module directly skips that debug branch.
      const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
      const result = await pdfParse(Buffer.from(buffer));
      return result.text?.trim() || null;
    }
    if (/\.docx$/i.test(fileName)) {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
      return result.value?.trim() || null;
    }
    return null;
  } catch (err) {
    console.error("Resume text extraction failed", err);
    return null;
  }
}
