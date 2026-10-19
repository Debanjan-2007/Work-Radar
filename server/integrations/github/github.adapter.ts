import { IIntegrationAdapter, NormalizedMessage } from '../integration.interface.js';
import { GitHubMapper } from './github.mapper.js';
import { encryptToken } from '../../security/tokenEncryption.js';
import { db } from '../../db/database.js';

export class GitHubAdapter implements IIntegrationAdapter {
  public readonly provider = 'github';

  async connect(tokenOrCode: string, userId: string): Promise<{ accessToken: string; scopes: string[] }> {
    const scopes = ['repo', 'read:user'];

    await db.saveIntegration({
      user_id: userId,
      provider: this.provider,
      access_token: encryptToken(tokenOrCode),
      scopes,
      status: 'CONNECTED',
      last_sync_at: new Date().toISOString()
    });

    return { accessToken: tokenOrCode, scopes };
  }

  async fetchMessages(userId: string, since?: Date): Promise<NormalizedMessage[]> {
    // In production, queries https://api.github.com/issues?filter=assigned
    const mockIssues = [
      {
        id: 1042,
        number: 142,
        title: 'Fix Authentication Token Expiry Bug',
        body: 'Investigate token refresh loop where expired JWT fails to rotate and loops in 401 state. Needs urgent patch.',
        html_url: 'https://github.com/org/core-api/issues/142',
        user: { login: 'octocat' },
        created_at: new Date().toISOString(),
        labels: [{ name: 'bug' }, { name: 'priority:high' }]
      },
      {
        id: 1045,
        number: 145,
        title: 'Review Pull Request: Add Priority Queue Max Heap Implementation',
        body: 'Please review and approve PR #145 before merging into develop branch.',
        html_url: 'https://github.com/org/core-api/pull/145',
        user: { login: 'tech-lead' },
        created_at: new Date().toISOString(),
        labels: [{ name: 'review-requested' }]
      }
    ];

    return mockIssues.map(i => GitHubMapper.mapToNormalized(i));
  }

  async refreshToken(userId: string): Promise<string> {
    // GitHub PATs or App tokens
    return 'token-refreshed';
  }

  async healthCheck(userId: string): Promise<{ healthy: boolean; details?: string }> {
    const integrations = await db.getIntegrations(userId);
    const item = integrations.find(i => i.provider === this.provider);
    if (!item) return { healthy: false, details: 'GitHub not connected' };
    return { healthy: item.status === 'CONNECTED', details: `Status: ${item.status}` };
  }

  async disconnect(userId: string): Promise<void> {
    const integrations = await db.getIntegrations(userId);
    const item = integrations.find(i => i.provider === this.provider);
    if (item) {
      await db.saveIntegration({
        ...item,
        status: 'DISCONNECTED',
        access_token: ''
      });
    }
  }
}
