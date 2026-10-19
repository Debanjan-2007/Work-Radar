import { NormalizedMessage } from '../integration.interface.js';

export interface RawOutlookMessage {
  id: string;
  subject: string;
  bodyPreview: string;
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  receivedDateTime: string;
  webLink?: string;
}

export class OutlookMapper {
  public static mapToNormalized(raw: RawOutlookMessage): NormalizedMessage {
    return {
      externalId: raw.id,
      provider: 'outlook',
      sender: raw.from.emailAddress.address,
      senderName: raw.from.emailAddress.name,
      subject: raw.subject,
      content: `${raw.subject}\n\n${raw.bodyPreview}`,
      sourceUrl: raw.webLink || `https://outlook.office.com/mail/id/${raw.id}`,
      receivedAt: new Date(raw.receivedDateTime || Date.now())
    };
  }
}
