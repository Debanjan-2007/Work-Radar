import { NormalizedMessage } from '../integration.interface.js';

export interface RawGmailMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  body: string;
  snippet?: string;
  date: string;
}

export class GmailMapper {
  public static mapToNormalized(raw: RawGmailMessage): NormalizedMessage {
    const senderParts = raw.from.match(/^(.*?)\s*<(.+)>$/);
    const senderName = senderParts ? senderParts[1].replace(/"/g, '').trim() : undefined;
    const senderEmail = senderParts ? senderParts[2].trim() : raw.from;

    return {
      externalId: raw.id,
      provider: 'gmail',
      sender: senderEmail,
      senderName,
      subject: raw.subject,
      content: `${raw.subject}\n\n${raw.body || raw.snippet || ''}`,
      sourceUrl: `https://mail.google.com/mail/u/0/#inbox/${raw.id}`,
      receivedAt: new Date(raw.date || Date.now()),
      metadata: {
        threadId: raw.threadId,
        snippet: raw.snippet
      }
    };
  }
}
