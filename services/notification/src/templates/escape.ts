const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes customer-provided text before it is placed into HTML email content. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Strips CR/LF so customer text can never inject additional email headers via the subject. */
export function toHeaderSafe(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}
