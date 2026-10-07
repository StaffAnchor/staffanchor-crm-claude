// The StaffAnchor WhatsApp Business number people can message. A tap opens a chat
// with the first message already typed in; when a person messages first, WhatsApp
// opens a free 24-hour window in which we can reply normally.
const NUMBER = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "911204128963").replace(/\D/g, "");

export const whatsappEntryLink = (text: string): string => `https://wa.me/${NUMBER}?text=${encodeURIComponent(text)}`;

/** One line for candidate-facing emails, in HTML and plain text. */
export function whatsappEmailLine(text: string) {
  const url = whatsappEntryLink(text);
  return {
    html: `<p style="margin-top:16px;">Prefer WhatsApp? <a href="${url}">Message us here</a> and a recruiter will reply.</p>`,
    text: `\n\nPrefer WhatsApp? Message us here: ${url}`,
  };
}
