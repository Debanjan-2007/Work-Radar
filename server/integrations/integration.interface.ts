export interface NormalizedMessage {
  externalId: string;
  provider: 'gmail' | 'github' | 'outlook' | 'teams' | 'chrome' | 'manual';
  sender: string;
  senderName?: string;
  subject?: string;
  content: string;
  sourceUrl?: string;
  receivedAt: Date;
  metadata?: Record<string, any>;
}

export interface IIntegrationAdapter {
  readonly provider: string;

  /**
   * Connects or authenticates the provider with the authorization code or credentials.
   */
  connect(authCode: string, userId: string): Promise<{ accessToken: string; refreshToken?: string; scopes: string[] }>;

  /**
   * Fetches incoming actionable messages from the provider since an optional date.
   */
  fetchMessages(userId: string, since?: Date): Promise<NormalizedMessage[]>;

  /**
   * Refreshes expired OAuth tokens for the given user.
   */
  refreshToken(userId: string): Promise<string>;

  /**
   * Verifies health status of the connection and credentials.
   */
  healthCheck(userId: string): Promise<{ healthy: boolean; details?: string }>;

  /**
   * Revokes tokens and disconnects integration.
   */
  disconnect(userId: string): Promise<void>;
}
