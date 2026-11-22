import { toHeaderSafe } from './escape.js';
import { detailRowsHtml, messageHtml, wrapHtml } from './layout.js';
import type { CategoryEnquiryTemplateInput, RenderedEmail } from './types.js';

export function renderCategoryEnquiry(input: CategoryEnquiryTemplateInput): RenderedEmail {
  const rows: Array<[string, string]> = [
    ['Category', input.category.name],
    ['Customer name', input.customer.name],
    ['Customer email', input.customer.email],
    ['Customer phone', input.customer.phone],
    ['Enquiry ID', input.enquiryId],
    ['Submitted at', input.submittedAt],
  ];
  return {
    subject: toHeaderSafe(`New category enquiry: ${input.category.name}`).slice(0, 200),
    text: [
      'A customer has submitted an enquiry about a product category.',
      '',
      ...rows.map(([label, value]) => `${label}: ${value}`),
      '',
      'Message:',
      input.message ?? '(no message provided)',
    ].join('\n'),
    html: wrapHtml('New category enquiry', `<table>${detailRowsHtml(rows)}</table><h3>Message</h3>${messageHtml(input.message)}`),
  };
}
