// Downloads a file someone sent on WhatsApp, using the media id Meta gave us.
export async function downloadWhatsAppMedia(mediaId: string): Promise<{ bytes: Uint8Array; mime: string | null } | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const meta = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!meta.ok) return null;
    const info = (await meta.json()) as { url?: string; mime_type?: string };
    if (!info.url) return null;
    const file = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!file.ok) return null;
    return { bytes: new Uint8Array(await file.arrayBuffer()), mime: info.mime_type ?? null };
  } catch {
    return null;
  }
}

/** The media id inside a stored inbound message, if it carried a file. */
export function mediaOf(raw: unknown): { id: string; name: string | null; mime: string | null } | null {
  const m = raw as { type?: string; document?: { id?: string; filename?: string; mime_type?: string }; image?: { id?: string; mime_type?: string } } | null;
  if (m?.document?.id) return { id: m.document.id, name: m.document.filename ?? null, mime: m.document.mime_type ?? null };
  if (m?.image?.id) return { id: m.image.id, name: null, mime: m.image.mime_type ?? null };
  return null;
}

export const safeFileName = (name: string) => name.normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_");
