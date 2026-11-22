import { z } from 'zod';
import { ENQUIRY_ENTITY_TYPES, ENQUIRY_LIMITS, phoneSchema } from './enquiry.js';

export const CATALOG_ENQUIRY_SUBMITTED = 'CATALOG_ENQUIRY_SUBMITTED' as const;

/** Versioned event contract: CATALOG_ENQUIRY_SUBMITTED v1. */
export const catalogEnquirySubmittedV1Schema = z.object({
  eventId: z.string().uuid(),
  eventType: z.literal(CATALOG_ENQUIRY_SUBMITTED),
  eventVersion: z.literal(1),
  occurredAt: z.string().datetime({ offset: true }),
  correlationId: z.string().min(1).max(128).optional(),
  data: z.object({
    enquiryId: z.string().uuid(),
    entity: z.object({
      type: z.enum(ENQUIRY_ENTITY_TYPES),
      id: z.string().trim().min(1).max(ENQUIRY_LIMITS.entityIdMax),
      name: z.string().trim().min(1).max(500),
    }),
    customer: z.object({
      name: z.string().trim().min(1).max(ENQUIRY_LIMITS.nameMax),
      email: z.string().trim().max(ENQUIRY_LIMITS.emailMax).email(),
      phone: phoneSchema,
    }),
    message: z.string().trim().min(1).max(ENQUIRY_LIMITS.messageMax).optional(),
  }),
});

export type CatalogEnquirySubmittedV1 = z.infer<typeof catalogEnquirySubmittedV1Schema>;

/** Internal callback contract: Notification Service -> Catalog Service. */
export const notificationStatusCallbackSchema = z
  .object({
    eventId: z.string().uuid(),
    notificationStatus: z.literal('SENT'),
    providerMessageId: z.string().trim().min(1).max(256),
    processedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type NotificationStatusCallback = z.infer<typeof notificationStatusCallbackSchema>;

export const CALLBACK_RESULTS = ['APPLIED', 'DUPLICATE', 'STALE_IGNORED'] as const;
export type CallbackResult = (typeof CALLBACK_RESULTS)[number];

export const notificationStatusCallbackResponseSchema = z.object({
  enquiryId: z.string(),
  status: z.enum(['RECEIVED', 'PROCESSED', 'RESOLVED']),
  callbackResult: z.enum(CALLBACK_RESULTS),
});
export type NotificationStatusCallbackResponse = z.infer<typeof notificationStatusCallbackResponseSchema>;
