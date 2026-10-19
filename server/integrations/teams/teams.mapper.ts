import { NormalizedMessage } from '../integration.interface.js';

export interface RawTeamsMessage {
  id: string;
  chatId?: string;
  from: {
    user: {
      displayName: string;
      id: string;
    };
  };
  body: {
    content: string;
  };
  createdDateTime: string;
}

export class TeamsMapper {
  public static mapToNormalized(raw: RawTeamsMessage): NormalizedMessage {
    const plainText = raw.body.content.replace(/<[^>]+>/g, '').trim();

    return {
      externalId: raw.id,
      provider: 'teams',
      sender: raw.from.user.displayName,
      senderName: raw.from.user.displayName,
      subject: `Teams Mention: ${plainText.slice(0, 50)}`,
      content: plainText,
      sourceUrl: `https://teams.microsoft.com/l/message/${raw.id}`,
      receivedAt: new Date(raw.createdDateTime || Date.now())
    };
  }
}
