import { z } from 'zod';

/**
 * Public enquiry request contract, shared by the React form and Catalog Service
 * so client-side and server-side validation rules cannot diverge.
 */
export const ENQUIRY_ENTITY_TYPES = ['PRODUCT', 'CATEGORY'] as const;
export type EnquiryEntityType = (typeof ENQUIRY_ENTITY_TYPES)[number];

export const ENQUIRY_LIMITS = {
  nameMax: 120,
  emailMax: 254,
  phoneMin: 7,
  phoneMax: 32,
  messageMax: 2000,
  entityIdMax: 128,
} as const;

/** Digits with optional leading +, spaces, dashes, dots and parentheses; 7-15 digits overall. */
const PHONE_PATTERN = /^\+?[0-9\s().-]+$/;

export const phoneSchema = z
  .string()
  .trim()
  .min(ENQUIRY_LIMITS.phoneMin, 'Phone number is required.')
  .max(ENQUIRY_LIMITS.phoneMax, 'Phone number is too long.')
  .regex(PHONE_PATTERN, 'Enter a valid phone number.')
  .refine((value) => {
    const digits = value.replace(/\D/g, '').length;
    return digits >= 7 && digits <= 15;
  }, 'Enter a valid phone number.');

export const enquiryRequestSchema = z
  .object({
    entity: z
      .object({
        type: z.enum(ENQUIRY_ENTITY_TYPES),
        id: z.string().trim().min(1, 'Entity id is required.').max(ENQUIRY_LIMITS.entityIdMax),
      })
      .strict(),
    customer: z
      .object({
        name: z.string().trim().min(1, 'Name is required.').max(ENQUIRY_LIMITS.nameMax, 'Name is too long.'),
        email: z
          .string()
          .trim()
          .max(ENQUIRY_LIMITS.emailMax, 'Email is too long.')
          .email('Enter a valid email address.'),
        phone: phoneSchema,
      })
      .strict(),
    message: z
      .string()
      .trim()
      .max(ENQUIRY_LIMITS.messageMax, `Message must be at most ${ENQUIRY_LIMITS.messageMax} characters.`)
      .optional()
      .transform((value) => (value === undefined || value.length === 0 ? undefined : value)),
  })
  .strict();

/** Parsed request; `message` is genuinely optional (absent when blank). */
export type EnquiryRequest = Omit<z.output<typeof enquiryRequestSchema>, 'message'> & { message?: string };
export type EnquiryRequestInput = z.input<typeof enquiryRequestSchema>;

export const ENQUIRY_STATUSES = ['RECEIVED', 'PROCESSED', 'RESOLVED'] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

/** Public, PII-free view of an enquiry's business lifecycle (GET /api/catalog/enquiries/{enquiryId}). */
export interface EnquiryStatusResponse {
  enquiryId: string;
  status: EnquiryStatus;
  entity: { type: EnquiryEntityType; id: string; name: string };
  receivedAt: string;
  processedAt: string | null;
  resolvedAt: string | null;
}

export interface EnquiryAcceptedResponse {
  enquiryId: string;
  status: 'RECEIVED';
  message: string;
}
