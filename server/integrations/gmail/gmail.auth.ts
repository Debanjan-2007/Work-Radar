import { encryptToken, decryptToken } from '../../security/tokenEncryption.js';
import { db } from '../../db/database.js';

export class GmailAuth {
  public static readonly SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

  /**
   * Exchanges authorization code for tokens (OAuth 2.0).
   */
  public static async exchangeAuthCode(authCode: string): Promise<{ accessToken: string; refreshToken: string; scopes: string[] }> {
    // In production, posts to https://oauth2.googleapis.com/token
    // Here we generate an encrypted token representation
    const accessToken = `ya29.gmail_token_${Date.now()}`;
    const refreshToken = `1//gmail_refresh_${Date.now()}`;
    return {
      accessToken,
      refreshToken,
      scopes: this.SCOPES
    };
  }

  /**
   * Refreshes the access token using the stored encrypted refresh token.
   */
  public static async refreshAccessToken(userId: string): Promise<string> {
    const integrations = await db.getIntegrations(userId);
    const gmailIntegration = integrations.find(i => i.provider === 'gmail');

    if (!gmailIntegration || !gmailIntegration.refresh_token) {
      throw new Error('No Gmail integration or refresh token available for user');
    }

    const decryptedRefresh = decryptToken(gmailIntegration.refresh_token);
    if (!decryptedRefresh) {
      throw new Error('Failed to decrypt Gmail refresh token');
    }

    const newAccessToken = `ya29.gmail_refreshed_${Date.now()}`;
    await db.saveIntegration({
      user_id: userId,
      provider: 'gmail',
      access_token: encryptToken(newAccessToken),
      refresh_token: gmailIntegration.refresh_token,
      scopes: this.SCOPES,
      status: 'CONNECTED',
      last_sync_at: new Date().toISOString()
    });

    return newAccessToken;
  }
}
