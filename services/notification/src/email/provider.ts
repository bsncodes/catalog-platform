import type { EnquiryEntityType } from '@catalog/contracts';
import type { RenderedEmail } from '../templates/index.js';

export interface OutgoingEmail extends RenderedEmail {
  to: string;
  from: string;
  replyTo?: string;
}

/** Provider acceptance result. Acceptance is not proof of inbox delivery (ASM-011). */
export interface EmailSendResult {
  providerMessageId: string;
}

export interface EmailProvider {
  send(email: OutgoingEmail): Promise<EmailSendResult>;
}

/** Trusted, server-side recipient resolution. Customer input never influences the recipient. */
export class SalesRecipientResolver {
  constructor(private readonly recipients: Record<EnquiryEntityType, string>) {}

  resolve(entityType: EnquiryEntityType): string {
    return this.recipients[entityType];
  }
}
