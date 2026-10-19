import { encryptToken, decryptToken } from '../../security/tokenEncryption.js';
import { db } from '../../db/database.js';

export class TeamsAuth {
  public static readonly SCOPES = ['ChannelMessage.Read.All', 'Chat.Read'];

  public static async exchangeAuthCode(authCode: string): Promise<{ accessToken: string; refreshToken: string; scopes: string[] }> {
    return {
      accessToken: `ms_teams_token_${Date.now()}`,
      refreshToken: `ms_teams_refresh_${Date.now()}`,
      scopes: this.SCOPES
    };
  }

  public static async refreshAccessToken(userId: string): Promise<string> {
    const integrations = await db.getIntegrations(userId);
    const item = integrations.find(i => i.provider === 'teams');
    if (!item || !item.refresh_token) {
      throw new Error('No Teams integration or refresh token found');
    }

    const decrypted = decryptToken(item.refresh_token);
    if (!decrypted) throw new Error('Decryption error for Teams token');

    const newAccessToken = `ms_teams_refreshed_${Date.now()}`;
    await db.saveIntegration({
      user_id: userId,
      provider: 'teams',
      access_token: encryptToken(newAccessToken),
      refresh_token: item.refresh_token,
      scopes: this.SCOPES,
      status: 'CONNECTED',
      last_sync_at: new Date().toISOString()
    });

    return newAccessToken;
  }
}
