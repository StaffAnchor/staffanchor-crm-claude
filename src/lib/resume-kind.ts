// What a resume file really is. The file name decides first; the first bytes decide when the name is missing or wrong
// (a .docx that is really an old .doc, a file saved with no extension), because candidates upload whatever they have.
export type ResumeKind = "pdf" | "docx" | "doc" | "image" | "other";

export function kindFromName(fileName: string): ResumeKind | null {
  if (/\.pdf$/i.test(fileName)) return "pdf";
  if (/\.docx$/i.test(fileName)) return "docx";
  if (/\.doc$/i.test(fileName)) return "doc";
  if (/\.(jpe?g|png|gif|webp)$/i.test(fileName)) return "image";
  return null;
}

export function kindFromBytes(b: Uint8Array): ResumeKind {
  const at = (i: number) => b[i] ?? -1;
  if (at(0) === 0x25 && at(1) === 0x50 && at(2) === 0x44 && at(3) === 0x46) return "pdf"; // %PDF
  if (at(0) === 0x50 && at(1) === 0x4b) return "docx"; // PK zip container
  if (at(0) === 0xd0 && at(1) === 0xcf && at(2) === 0x11 && at(3) === 0xe0) return "doc"; // old Word (OLE)
  if ((at(0) === 0xff && at(1) === 0xd8) || (at(0) === 0x89 && at(1) === 0x50) || (at(0) === 0x47 && at(1) === 0x49) || (at(0) === 0x52 && at(1) === 0x49)) return "image";
  return "other";
}

export const MAX_DOC_PREVIEW_BYTES = 6 * 1024 * 1024;
