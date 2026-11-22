import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailProvider, EmailSendResult, OutgoingEmail } from './provider.js';

/** Local SMTP provider targeting Mailpit. */
export class MailpitSmtpProvider implements EmailProvider {
  private readonly transporter: Transporter;

  constructor(options: { host: string; port: number }) {
    this.transporter = nodemailer.createTransport({ host: options.host, port: options.port, secure: false, connectionTimeout: 5000, socketTimeout: 10000 });
  }

  async send(email: OutgoingEmail): Promise<EmailSendResult> {
    const info = await this.transporter.sendMail({
      from: email.from,
      to: email.to,
      ...(email.replyTo ? { replyTo: email.replyTo } : {}),
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    if (!info.messageId) throw new Error('SMTP server did not return a message id');
    return { providerMessageId: info.messageId };
  }
}
