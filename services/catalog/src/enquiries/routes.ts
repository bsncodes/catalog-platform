import { timingSafeEqual } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { enquiryRequestSchema, notificationStatusCallbackSchema, type EnquiryAcceptedResponse } from '@catalog/contracts';
import type { ZodError } from 'zod';
import { AppError, Errors, type ErrorDetail } from '../errors.js';
import type { EnquiryService } from './enquiryService.js';

function toDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({ field: issue.path.join('.') || '(body)', message: issue.message }));
}

/** Unknown keys, or a top-level `entity`/`customer` that is present but not an object. Missing fields stay 422. */
function isStructuralIssue(issue: ZodError['issues'][number], body: Record<string, unknown>): boolean {
  if (issue.code === 'unrecognized_keys') return true;
  const [topLevel] = issue.path;
  return issue.code === 'invalid_type' && issue.path.length === 1 && typeof topLevel === 'string' && body[topLevel] !== undefined;
}

export function publicEnquiryRoutes(enquiries: Pick<EnquiryService, 'createEnquiry'>, ratePerMinute: number): Router {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: ratePerMinute,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many enquiries. Please try again shortly.', requestId: req.correlationId } });
    },
  });

  router.post('/enquiries', limiter, async (req, res) => {
    if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) {
      throw new AppError(400, 'MALFORMED_REQUEST', 'The request body must be a JSON object.');
    }
    const parsed = enquiryRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      // 400: the request shape is wrong (unknown keys, entity/customer not objects). 422: field values invalid.
      if (parsed.error.issues.some((issue) => isStructuralIssue(issue, req.body as Record<string, unknown>))) throw Errors.validation('The enquiry request is structurally invalid.', toDetails(parsed.error));
      throw Errors.unprocessable('The enquiry contains invalid values.', toDetails(parsed.error));
    }

    const created = await enquiries.createEnquiry(parsed.data, req.correlationId);
    req.log.info({ enquiryId: created.enquiryId, eventId: created.eventId, entityType: parsed.data.entity.type }, 'enquiry received');
    const body: EnquiryAcceptedResponse = { enquiryId: created.enquiryId, status: 'RECEIVED', message: 'Your enquiry has been received.' };
    res.status(202).json(body);
  });

  return router;
}

/** Service-to-service bearer token check (ASM-030 / DEC: shared secret from Secrets Manager in AWS). */
export function requireServiceToken(expectedToken: string) {
  const expected = Buffer.from(expectedToken);
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.header('authorization') ?? '';
    const presented = Buffer.from(header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '');
    if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
      next(Errors.unauthorized());
      return;
    }
    next();
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function internalEnquiryRoutes(enquiries: Pick<EnquiryService, 'applyNotificationCallback'>, token: string): Router {
  const router = Router();
  router.use(requireServiceToken(token));

  router.patch('/enquiries/:enquiryId/notification-status', async (req, res) => {
    const { enquiryId } = req.params;
    if (!UUID_PATTERN.test(enquiryId)) throw Errors.validation('The enquiry identifier is malformed.', [{ field: 'enquiryId', message: 'Must be a UUID.' }]);
    const parsed = notificationStatusCallbackSchema.safeParse(req.body);
    if (!parsed.success) throw Errors.validation('The callback payload is invalid.', toDetails(parsed.error));

    const outcome = await enquiries.applyNotificationCallback(enquiryId.toLowerCase(), parsed.data);
    req.log.info({ enquiryId, eventId: parsed.data.eventId, callbackResult: outcome.callbackResult }, 'notification callback handled');
    res.status(200).json(outcome);
  });

  return router;
}
