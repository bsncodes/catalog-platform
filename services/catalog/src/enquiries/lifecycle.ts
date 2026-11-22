import type { EnquiryStatus } from '@catalog/contracts';

/** The only permitted business transitions: RECEIVED -> PROCESSED -> RESOLVED. */
const ALLOWED: Record<EnquiryStatus, readonly EnquiryStatus[]> = {
  RECEIVED: ['PROCESSED'],
  PROCESSED: ['RESOLVED'],
  RESOLVED: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: EnquiryStatus,
    readonly to: EnquiryStatus,
  ) {
    super(`Enquiry cannot transition from ${from} to ${to}.`);
    this.name = 'InvalidTransitionError';
  }
}

export function canTransition(from: EnquiryStatus, to: EnquiryStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: EnquiryStatus, to: EnquiryStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export type NotificationCallbackDecision = { action: 'APPLY' } | { action: 'ALREADY_PROCESSED' } | { action: 'STALE_IGNORED' };

/**
 * Decide how a successful-notification callback affects an enquiry in a given state.
 * A callback must never regress a RESOLVED enquiry.
 */
export function decideNotificationCallback(current: EnquiryStatus): NotificationCallbackDecision {
  switch (current) {
    case 'RECEIVED':
      return { action: 'APPLY' };
    case 'PROCESSED':
      return { action: 'ALREADY_PROCESSED' };
    case 'RESOLVED':
      return { action: 'STALE_IGNORED' };
  }
}
