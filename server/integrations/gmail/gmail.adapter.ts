import { IIntegrationAdapter, NormalizedMessage } from '../integration.interface.js';
import { GmailAuth } from './gmail.auth.js';
import { GmailMapper } from './gmail.mapper.js';
import { encryptToken, decryptToken } from '../../security/tokenEncryption.js';
import { DEMO_USER } from '../../middleware/auth.js';
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
    // 1. Check if user has real connected Gmail credentials
    try {
      const integrations = await db.getIntegrations(userId);
      const gmailIntegration = integrations.find(i => i.provider === this.provider && i.status === 'CONNECTED');

      if (gmailIntegration && gmailIntegration.access_token) {
        const accessToken = decryptToken(gmailIntegration.access_token);

        // Fetch recent messages from Gmail inbox
        const listRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=is:inbox', {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (listRes.ok) {
          const listData = (await listRes.json()) as any;
          if (listData.messages && Array.isArray(listData.messages)) {
            const fetched = await Promise.all(
              listData.messages.slice(0, 5).map(async (m: { id: string }) => {
                try {
                  const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, {
                    headers: { Authorization: `Bearer ${accessToken}` }
                  });
                  if (!msgRes.ok) return null;
                  const msgData = (await msgRes.json()) as any;

                  const headers = msgData.payload?.headers || [];
                  const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || '(No Subject)';
                  const from = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || 'Unknown Sender';
                  const date = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || new Date().toISOString();
                  const snippet = msgData.snippet || '';

                  return {
                    id: msgData.id,
                    threadId: msgData.threadId,
                    from,
                    subject,
                    body: snippet,
                    date
                  };
                } catch {
                  return null;
                }
              })
            );

            const validMessages = fetched.filter(Boolean) as any[];
            if (validMessages.length > 0) {
              return validMessages.map(m => GmailMapper.mapToNormalized(m));
            }
          }
        }
      }
    } catch (err) {
      console.warn('[GmailAdapter] Real Gmail fetch failed or offline:', err);
    }

    // 2. Demo fallback only for the Demo User account
    if (userId === DEMO_USER.id) {
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

    // 3. For real users with no emails or unlinked Gmail, return empty array
    return [];
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
