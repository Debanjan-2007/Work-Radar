import { IIntegrationAdapter, NormalizedMessage } from '../integration.interface.js';
import { GmailAuth } from './gmail.auth.js';
import { GmailMapper } from './gmail.mapper.js';
import { encryptToken } from '../../security/tokenEncryption.js';
import { db } from '../../db/database.js';

export class GmailAdapter implements IIntegrationAdapter {
  public readonly provider = 'gmail';

  async connect(authCode: string, userId: string): Promise<{ accessToken: string; refreshToken?: string; scopes: string[] }> {
    const { accessToken, refreshToken, scopes } = await GmailAuth.exchangeAuthCode(authCode);

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
    // In production, queries Gmail API users.messages.list({ q: 'label:work-radar' })
    // Returns simulated live actionable emails matching PRD Section 15
    const mockMessages = [
      {
        id: `gmail-msg-${Date.now()}`,
        threadId: 'thread-8841',
        from: 'sarah.connor@clientcorp.com',
        subject: 'URGENT: Submit Final Milestone Deliverable',
        body: 'Hi Alex, please review the final milestone report and submit it before 6 PM today so our VP can sign off.',
        date: new Date().toISOString()
      },
      {
        id: `gmail-msg-${Date.now() + 1}`,
        threadId: 'thread-8842',
        from: 'marcus.v@acme.org',
        subject: 'Action Required: Schedule Q4 Security Architecture Review',
        body: 'Please coordinate with the devops team to schedule the architecture review before Friday.',
        date: new Date().toISOString()
      }
    ];

    return mockMessages.map(m => GmailMapper.mapToNormalized(m));
  }

  async refreshToken(userId: string): Promise<string> {
    return GmailAuth.refreshAccessToken(userId);
  }

  async healthCheck(userId: string): Promise<{ healthy: boolean; details?: string }> {
    const integrations = await db.getIntegrations(userId);
    const item = integrations.find(i => i.provider === this.provider);
    if (!item) {
      return { healthy: false, details: 'Integration not connected' };
    }
    if (item.status !== 'CONNECTED') {
      return { healthy: false, details: `Status is ${item.status}` };
    }
    return { healthy: true, details: `Connected with scopes: ${item.scopes?.join(', ')}` };
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
