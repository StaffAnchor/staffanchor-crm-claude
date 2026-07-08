import mammoth from "mammoth";

// Extracts plain text from a resume file buffer so it can be fed into the AI
// summary prompt. Supports the two formats candidates actually upload (PDF,
// DOCX). Returns null (rather than throwing) on anything unexpected -- a
// resume that fails to parse should degrade to "no resume text available",
// not break summary generation entirely.
export async function extractResumeText(buffer: ArrayBuffer, fileName: string): Promise<string | null> {
  try {
    if (/\.pdf$/i.test(fileName)) {
      const pdfParse = (await import("pdf-parse")).default;
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
