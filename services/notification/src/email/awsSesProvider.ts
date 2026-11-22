import { SendEmailCommand, type SESv2Client } from '@aws-sdk/client-sesv2';
import type { EmailProvider, EmailSendResult, OutgoingEmail } from './provider.js';

/** Production provider using Amazon SES v2 (AWS SDK v3). Credentials come from the ECS task role. */
export class AwsSesProvider implements EmailProvider {
  constructor(private readonly client: SESv2Client) {}

  async send(email: OutgoingEmail): Promise<EmailSendResult> {
    const result = await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: email.from,
        Destination: { ToAddresses: [email.to] },
        ...(email.replyTo ? { ReplyToAddresses: [email.replyTo] } : {}),
        Content: {
          Simple: {
            Subject: { Data: email.subject, Charset: 'UTF-8' },
            Body: { Text: { Data: email.text, Charset: 'UTF-8' }, Html: { Data: email.html, Charset: 'UTF-8' } },
          },
        },
      }),
    );
    if (!result.MessageId) throw new Error('SES did not return a message id');
    return { providerMessageId: result.MessageId };
  }
}
