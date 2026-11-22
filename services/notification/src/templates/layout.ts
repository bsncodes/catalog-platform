import { escapeHtml } from './escape.js';

/** Shared table rows for customer details; every value is escaped. */
export function detailRowsHtml(rows: Array<[string, string]>): string {
  return rows
    .map(([label, value]) => `<tr><th align="left" style="padding:4px 12px 4px 0">${escapeHtml(label)}</th><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`)
    .join('');
}

export function messageHtml(message: string | undefined): string {
  if (!message) return '<p><em>No message was provided.</em></p>';
  return `<p style="white-space:pre-wrap">${escapeHtml(message)}</p>`;
}

export function wrapHtml(heading: string, body: string): string {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1f2933"><h2>${escapeHtml(heading)}</h2>${body}</body></html>`;
}
