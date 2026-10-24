// What the AI is shown is stripped of contact details first: emails, phone numbers and links never reach the model. Messages
// are sent by the CRM itself when an admin approves them, using the number or address on file.

export function redact(text: string | null | undefined, max = 600): string {
  return (text ?? "")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/https?:\/\/\S+|www\.\S+|linkedin\.com\/\S+/gi, "[link]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[number]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
