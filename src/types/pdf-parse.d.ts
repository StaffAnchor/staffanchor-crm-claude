declare module "pdf-parse" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info: unknown;
    metadata: unknown;
  }
  function pdfParse(data: Buffer): Promise<PdfParseResult>;
  export default pdfParse;
}
