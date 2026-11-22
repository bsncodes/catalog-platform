import { toHeaderSafe } from './escape.js';
import { detailRowsHtml, messageHtml, wrapHtml } from './layout.js';
import type { ProductEnquiryTemplateInput, RenderedEmail } from './types.js';

export function renderProductEnquiry(input: ProductEnquiryTemplateInput): RenderedEmail {
  const rows: Array<[string, string]> = [
    ['Product', `${input.product.name} (ID ${input.product.id})`],
    ['Customer name', input.customer.name],
    ['Customer email', input.customer.email],
    ['Customer phone', input.customer.phone],
    ['Enquiry ID', input.enquiryId],
    ['Submitted at', input.submittedAt],
  ];
  return {
    subject: toHeaderSafe(`New product enquiry: ${input.product.name}`).slice(0, 200),
    text: [
      'A customer has submitted a product enquiry.',
      '',
      ...rows.map(([label, value]) => `${label}: ${value}`),
      '',
      'Message:',
      input.message ?? '(no message provided)',
    ].join('\n'),
    html: wrapHtml('New product enquiry', `<table>${detailRowsHtml(rows)}</table><h3>Message</h3>${messageHtml(input.message)}`),
  };
}
