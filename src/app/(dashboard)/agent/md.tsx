import Link from "next/link";
import type { ReactNode } from "react";

// Just enough formatting for the assistant's answers: paragraphs, bullet lists, bold, and links to records inside the CRM.
// It builds React elements and never inserts HTML, so nothing in a reply can run as code.

const TOKEN = /(\*\*[^*]+\*\*|\[[^\]]+\]\(\/[^)\s]*\))/g;

function inline(text: string, key: string): ReactNode[] {
  return text.split(TOKEN).filter(Boolean).map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={`${key}-${i}`} className="font-semibold">{bold[1]}</strong>;
    const link = part.match(/^\[([^\]]+)\]\((\/[^)\s]*)\)$/);
    if (link) return <Link key={`${key}-${i}`} href={link[2]} className="font-medium text-teal-700 underline decoration-teal-300 underline-offset-2 hover:text-teal-900 dark:text-teal-300">{link[1]}</Link>;
    return <span key={`${key}-${i}`}>{part}</span>;
  });
}

export default function Md({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = (k: number) => {
    if (!list.length) return;
    blocks.push(<ul key={`ul${k}`} className="my-1.5 list-disc space-y-1 pl-5">{list.map((li, i) => <li key={i}>{inline(li, `li${k}-${i}`)}</li>)}</ul>);
    list = [];
  };
  text.split("\n").forEach((raw, k) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (bullet) {
      list.push(bullet[1]);
      return;
    }
    flush(k);
    if (!line.trim()) return;
    const head = line.match(/^#{1,3}\s+(.*)$/);
    blocks.push(head ? <p key={k} className="mt-2 font-semibold">{inline(head[1], `h${k}`)}</p> : <p key={k} className="my-1">{inline(line, `p${k}`)}</p>);
  });
  flush(9999);
  return <div className="text-[14px] leading-relaxed">{blocks}</div>;
}
