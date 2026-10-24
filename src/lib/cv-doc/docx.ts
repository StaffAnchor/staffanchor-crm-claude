import {
  AlignmentType, BorderStyle, Document, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TabStopPosition, TabStopType, TextRun, WidthType,
} from "docx";
import type { CvDoc } from "./types";
import type { Photo } from "./pdf";

// The same CV as a Word file, so it can be edited. Plain structure (headings, paragraphs, bullets) that Word and applicant
// tracking systems both read well.

const NAVY = "0F2547", MUTED = "5B6472", ACCENT = "1D4ED8";
const FONT = "Calibri";
const run = (text: string, o: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}) => new TextRun({ text, font: FONT, size: o.size ?? 21, bold: o.bold, italics: o.italics, color: o.color });

const heading = (t: string) =>
  new Paragraph({
    spacing: { before: 240, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D7DCE3", space: 2 } },
    keepNext: true,
    children: [run(t.toUpperCase(), { bold: true, size: 19, color: NAVY })],
  });
const bullet = (t: string) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 30 }, children: [run(t)] });
const rowWithRight = (left: TextRun[], right: string) =>
  new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }], keepNext: true, children: [...left, new TextRun({ text: `\t${right}`, font: FONT, size: 18, color: MUTED })] });

export async function renderCvDocx(doc: CvDoc, photo: Photo): Promise<Buffer> {
  const h = doc.header;
  const contact = [h.email, h.phone, h.city, h.linkedin].filter(Boolean).join("   |   ");
  const kids: (Paragraph | Table)[] = [];

  const left = [
    new Paragraph({ children: [run(h.name, { bold: true, size: 50, color: NAVY })] }),
    ...(h.headline ? [new Paragraph({ children: [run(h.headline, { size: 23, color: ACCENT })] })] : []),
    ...(contact ? [new Paragraph({ spacing: { before: 60 }, children: [run(contact, { size: 18, color: MUTED })] })] : []),
  ];
  if (h.showPhoto && photo) {
    const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
    const borders = { top: none, bottom: none, left: none, right: none };
    kids.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { ...borders, insideHorizontal: none, insideVertical: none },
        rows: [
          new TableRow({
            children: [
              new TableCell({ borders, width: { size: 82, type: WidthType.PERCENTAGE }, children: left }),
              new TableCell({ borders, width: { size: 18, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new ImageRun({ type: photo.format, data: photo.data, transformation: { width: 82, height: 82 } })] })] }),
            ],
          }),
        ],
      }),
    );
  } else kids.push(...left);

  if (doc.summary.trim()) kids.push(heading("Summary"), new Paragraph({ children: [run(doc.summary)] }));
  if (doc.highlights.length) kids.push(heading("Career at a glance"), ...doc.highlights.map(bullet));

  if (doc.experience.length) {
    kids.push(heading("Experience"));
    for (const e of doc.experience) {
      kids.push(rowWithRight([run(e.company, { bold: true, size: 23, color: NAVY })], [e.location, e.roles.length > 1 ? e.period : ""].filter(Boolean).join("  ·  ")));
      for (const r of e.roles) kids.push(rowWithRight([run(r.title, { bold: true })], e.roles.length > 1 || !e.period ? r.period : e.period));
      if (e.scope) kids.push(new Paragraph({ spacing: { before: 20, after: 20 }, children: [run(e.scope, { italics: true, color: MUTED })] }));
      kids.push(...e.bullets.map(bullet));
      if (e.tools) kids.push(new Paragraph({ spacing: { before: 20, after: 120 }, children: [run(`Tools: ${e.tools}`, { size: 18, color: MUTED })] }));
      else kids.push(new Paragraph({ spacing: { after: 100 }, children: [] }));
    }
  }
  if (doc.education.length) {
    kids.push(heading("Education"));
    for (const e of doc.education) kids.push(rowWithRight([run(e.degree, { bold: true }), run(e.institution ? `, ${e.institution}` : "")], e.year));
  }
  if (doc.skills.length) {
    kids.push(heading("Skills"));
    for (const g of doc.skills) kids.push(new Paragraph({ spacing: { after: 30 }, children: [run(`${g.label}: `, { bold: true }), run(g.items.join("  ·  "))] }));
  }
  if (doc.certifications.length) kids.push(heading("Certifications"), ...doc.certifications.map(bullet));
  if (doc.awards.length) kids.push(heading("Awards and recognition"), ...doc.awards.map(bullet));

  const d = new Document({
    title: h.name || "CV",
    creator: h.name || "CV",
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 800, right: 800 } } }, children: kids }],
  });
  return Buffer.from(await Packer.toBuffer(d));
}
