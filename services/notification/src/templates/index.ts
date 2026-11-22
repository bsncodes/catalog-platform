import type { CatalogEnquirySubmittedV1 } from '@catalog/contracts';
import { renderCategoryEnquiry } from './categoryEnquiry.js';
import { renderProductEnquiry } from './productEnquiry.js';
import type { RenderedEmail } from './types.js';

export type { RenderedEmail } from './types.js';

/** Template selection is driven by the validated event's entity type only; transport-independent. */
export function renderEnquiryEmail(event: CatalogEnquirySubmittedV1): RenderedEmail {
  const { data } = event;
  const base = {
    enquiryId: data.enquiryId,
    submittedAt: event.occurredAt,
    customer: data.customer,
    ...(data.message ? { message: data.message } : {}),
  };
  switch (data.entity.type) {
    case 'PRODUCT':
      return renderProductEnquiry({ ...base, product: { id: data.entity.id, name: data.entity.name } });
    case 'CATEGORY':
      return renderCategoryEnquiry({ ...base, category: { id: data.entity.id, name: data.entity.name } });
  }
}
