import { IIntegrationAdapter, NormalizedMessage } from '../integration.interface.js';
import { TeamsAuth } from './teams.auth.js';
import { TeamsMapper } from './teams.mapper.js';
import { encryptToken } from '../../security/tokenEncryption.js';
import { db } from '../../db/database.js';

export class TeamsAdapter implements IIntegrationAdapter {
  public readonly provider = 'teams';

  async connect(authCode: string, userId: string): Promise<{ accessToken: string; refreshToken?: string; scopes: string[] }> {
    const { accessToken, refreshToken, scopes } = await TeamsAuth.exchangeAuthCode(authCode);

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
        id: `teams-msg-${Date.now()}`,
        from: {
          user: {
            displayName: 'Dev Lead (Engineering)',
            id: 'user-teams-44'
          }
        },
        body: {
          content: '<p>@Alex please remember to finish and test the database connection migration before tomorrow noon.</p>'
        },
        createdDateTime: new Date().toISOString()
      }
    ];

    return mockMessages.map(m => TeamsMapper.mapToNormalized(m));
  }

  async refreshToken(userId: string): Promise<string> {
    return TeamsAuth.refreshAccessToken(userId);
  }

  async healthCheck(userId: string): Promise<{ healthy: boolean; details?: string }> {
    const integrations = await db.getIntegrations(userId);
    const item = integrations.find(i => i.provider === this.provider);
    if (!item) return { healthy: false, details: 'Teams not connected' };
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
