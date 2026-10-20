import { IIntegrationAdapter, NormalizedMessage } from '../integration.interface.js';
import { GmailAuth } from './gmail.auth.js';
import { GmailMapper } from './gmail.mapper.js';
import { encryptToken, decryptToken } from '../../security/tokenEncryption.js';
import { DEMO_USER } from '../../middleware/auth.js';
import { db } from '../../db/database.js';

function decodeBase64Url(data: string): string {
  const padded = data.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((data.length + 3) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function extractGmailBody(payload: any): string {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (Array.isArray(payload.parts)) {
    const plain = payload.parts.find((p: any) => p.mimeType === 'text/plain' && p.body?.data);
    if (plain?.body?.data) return decodeBase64Url(plain.body.data);
    const html = payload.parts.find((p: any) => p.mimeType === 'text/html' && p.body?.data);
    if (html?.body?.data) {
      return decodeBase64Url(html.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    for (const part of payload.parts) {
      const nested = extractGmailBody(part);
      if (nested) return nested;
    }
  }
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  return '';
}

export class GmailAdapter implements IIntegrationAdapter {
  public readonly provider = 'gmail';

  async connect(authCode: string, userId: string): Promise<{ accessToken: string; refreshToken?: string; scopes: string[] }> {
    const { accessToken, refreshToken, scopes } = await GmailAuth.exchangeAuthCode(authCode);

    await db.saveIntegration({
      user_id: userId,
      provider: this.provider,
      access_token: encryptToken(accessToken),
      refresh_token: refreshToken ? encryptToken(refreshToken) : undefined,
      scopes,
      status: 'CONNECTED',
      last_sync_at: new Date().toISOString()
    });

    return { accessToken, refreshToken, scopes };
  }

  async fetchMessages(userId: string, since?: Date): Promise<NormalizedMessage[]> {
    try {
      const integrations = await db.getIntegrations(userId);
      const gmailIntegration = integrations.find(i => i.provider === this.provider && i.status === 'CONNECTED');

      if (gmailIntegration && gmailIntegration.access_token) {
        let accessToken = decryptToken(gmailIntegration.access_token);
        const newerThan = since
          ? `after:${Math.floor(since.getTime() / 1000)}`
          : 'newer_than:30d';
        const query = `in:inbox -category:promotions -category:social ${newerThan}`;

        const fetchList = async (token: string) =>
          fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=${encodeURIComponent(query)}`, {
            headers: { Authorization: `Bearer ${token}` }
          });

        let listRes = await fetchList(accessToken);
        if (listRes.status === 401) {
          try {
            accessToken = await this.refreshToken(userId);
            listRes = await fetchList(accessToken);
          } catch (refreshErr) {
            console.warn('[GmailAdapter] Token refresh failed:', refreshErr);
          }
        }

        if (!listRes.ok) {
          const errText = await listRes.text().catch(() => '');
          console.warn(`[GmailAdapter] List messages failed: ${listRes.status} ${errText.slice(0, 300)}`);
        } else {
          const listData = (await listRes.json()) as any;
          const ids: { id: string }[] = Array.isArray(listData.messages) ? listData.messages : [];
          const fetched = await Promise.all(
            ids.slice(0, 25).map(async (m) => {
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
                const body = extractGmailBody(msgData.payload) || msgData.snippet || '';

                return {
                  id: msgData.id,
                  threadId: msgData.threadId,
                  from,
                  subject,
                  body,
                  snippet: msgData.snippet,
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
    } catch (err) {
      console.warn('[GmailAdapter] Real Gmail fetch failed or offline:', err);
    }

    // No Gmail integration connected, return empty array
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
