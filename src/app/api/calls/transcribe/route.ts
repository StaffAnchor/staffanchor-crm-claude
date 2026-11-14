import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GEMINI_QUALITY_MODELS, generateFromFile } from "@/lib/ai-providers";
import { logAiUsage } from "@/lib/ai-usage";

export const runtime = "nodejs";
export const maxDuration = 60;

// Turns a recruiter's spoken note after a call into text for the notes box. The audio is read and then thrown away: nothing is
// stored. Hindi, English and the mix of both are written in plain English letters, and filler is left out.
const MAX_BYTES = 4 * 1024 * 1024; // the platform rejects request bodies a little over this

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner", "freelancer"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File) || audio.size === 0) return NextResponse.json({ error: "No recording received." }, { status: 400 });
  if (audio.size > MAX_BYTES) return NextResponse.json({ error: "That recording is too long. Keep a voice note under about 2 minutes." }, { status: 413 });
  const mimeType = audio.type === "audio/x-wav" ? "audio/wav" : audio.type || "audio/wav";
  if (!/^audio\//.test(mimeType)) return NextResponse.json({ error: "That is not an audio file." }, { status: 415 });

  const prompt = `This is a recruiter speaking a short note about a phone call with a sales candidate. Write down what they said as plain text, as they would type it to a colleague. They may speak Hindi, English or a mix: write Hindi words in English letters (Hinglish) as spoken, do not translate. Remove filler like "um" and repeated words. Keep numbers and names exactly as said (pay as "18 lakh", notice as "60 days"). Do not add anything that was not said, and do not add a heading. If nothing intelligible was said, return an empty string. Return ONLY the text.`;
  try {
    const result = await generateFromFile(prompt, { mimeType, base64: Buffer.from(await audio.arrayBuffer()).toString("base64") }, { geminiModels: GEMINI_QUALITY_MODELS, thinkingBudget: 0 });
    await logAiUsage({ purpose: "voice_note", result, prompt });
    const text = result.text.replace(/^["'\s]+|["'\s]+$/g, "").slice(0, 4000);
    if (!text) return NextResponse.json({ error: "I couldn't hear anything in that recording. Try again, closer to the microphone." }, { status: 422 });
    return NextResponse.json({ ok: true, text });
  } catch (e) {
    await logAiUsage({ purpose: "voice_note", error: e instanceof Error ? e.message : String(e), prompt });
    const paused = e instanceof Error && /paused/i.test(e.message);
    return NextResponse.json({ error: paused ? "AI is paused by an admin." : "Couldn't turn that voice note into text just now. Type it instead." }, { status: paused ? 503 : 502 });
  }
}
