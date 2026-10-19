import { IIntegrationAdapter, NormalizedMessage } from '../integration.interface.js';
import { OutlookAuth } from './outlook.auth.js';
import { OutlookMapper } from './outlook.mapper.js';
import { encryptToken } from '../../security/tokenEncryption.js';
import { db } from '../../db/database.js';

export class OutlookAdapter implements IIntegrationAdapter {
  public readonly provider = 'outlook';

  async connect(authCode: string, userId: string): Promise<{ accessToken: string; refreshToken?: string; scopes: string[] }> {
    const { accessToken, refreshToken, scopes } = await OutlookAuth.exchangeAuthCode(authCode);

    await db.saveIntegration({
      user_id: userId,
      provider: this.provider,
      access_token: encryptToken(accessToken),
      refresh_token: encryptToken(refreshToken),
      scopes,
      status: 'CONNECTED',
      last_sync_at: new Date().toISOString()
    });

    return { accessToken, refreshToken, scopes };
  }

  async fetchMessages(userId: string, since?: Date): Promise<NormalizedMessage[]> {
    const mockMessages = [
      {
        id: `outlook-msg-${Date.now()}`,
        subject: 'Review Security Audit Documentation',
        bodyPreview: 'Hi team, please review the compliance review checklist before Monday morning.',
        from: {
          emailAddress: {
            name: 'Marcus Vance',
            address: 'marcus.vance@enterprisecorp.com'
          }
        },
        receivedDateTime: new Date().toISOString()
      }
    ];

    return mockMessages.map(m => OutlookMapper.mapToNormalized(m));
  }

  async refreshToken(userId: string): Promise<string> {
    return OutlookAuth.refreshAccessToken(userId);
  }

  async healthCheck(userId: string): Promise<{ healthy: boolean; details?: string }> {
    const integrations = await db.getIntegrations(userId);
    const item = integrations.find(i => i.provider === this.provider);
    if (!item) return { healthy: false, details: 'Outlook not connected' };
    return { healthy: item.status === 'CONNECTED', details: `Status: ${item.status}` };
  }

  async disconnect(userId: string): Promise<void> {
    const integrations = await db.getIntegrations(userId);
    const item = integrations.find(i => i.provider === this.provider);
    if (item) {
      await db.saveIntegration({
        ...item,
        status: 'DISCONNECTED',
        access_token: '',
        refresh_token: ''
      });
    }
  }
}
