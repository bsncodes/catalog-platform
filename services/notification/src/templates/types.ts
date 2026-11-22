export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

interface BaseTemplateInput {
  enquiryId: string;
  submittedAt: string;
  customer: { name: string; email: string; phone: string };
  message?: string;
}

export interface ProductEnquiryTemplateInput extends BaseTemplateInput {
  product: { id: string; name: string };
}

export interface CategoryEnquiryTemplateInput extends BaseTemplateInput {
  category: { id: string; name: string };
}
