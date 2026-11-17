import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { kindFromBytes, MAX_DOC_PREVIEW_BYTES } from "@/lib/resume-kind";
import { extractResumeText } from "@/lib/resume-text";

export const runtime = "nodejs";

// Plain-text preview of an old Word (.doc) resume. The browser cannot read that format, so the page sends the file
// bytes here and gets the words back (layout is not kept). Signed-in users only; nothing is stored.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const buf = await req.arrayBuffer();
  if (buf.byteLength === 0 || buf.byteLength > MAX_DOC_PREVIEW_BYTES) {
    return NextResponse.json({ error: "File is empty or too large to preview." }, { status: 413 });
  }
  if (kindFromBytes(new Uint8Array(buf, 0, 8)) !== "doc") return NextResponse.json({ error: "Not an old Word document." }, { status: 415 });

  const text = await extractResumeText(buf, "resume.doc");
  if (!text) return NextResponse.json({ error: "Couldn't read this document." }, { status: 422 });
  return NextResponse.json({ text });
}
