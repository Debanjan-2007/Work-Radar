import { IIntegrationAdapter, NormalizedMessage } from './integration.interface.js';
import { GmailAdapter } from './gmail/gmail.adapter.js';
import { GitHubAdapter } from './github/github.adapter.js';
import { OutlookAdapter } from './outlook/outlook.adapter.js';
import { TeamsAdapter } from './teams/teams.adapter.js';
import { db } from '../db/database.js';

export class IntegrationManager {
  private adapters: Map<string, IIntegrationAdapter> = new Map();

  constructor() {
    this.registerAdapter(new GmailAdapter());
    this.registerAdapter(new GitHubAdapter());
    this.registerAdapter(new OutlookAdapter());
    this.registerAdapter(new TeamsAdapter());
  }

  public registerAdapter(adapter: IIntegrationAdapter): void {
    this.adapters.set(adapter.provider.toLowerCase(), adapter);
  }

  public getAdapter(provider: string): IIntegrationAdapter | undefined {
    return this.adapters.get(provider.toLowerCase());
  }

  public getAllProviders(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Connects a provider with supplied authorization credentials.
   */
  public async connectProvider(provider: string, authData: string, userId: string): Promise<any> {
    const adapter = this.getAdapter(provider);
    if (!adapter) throw new Error(`Unsupported integration provider: ${provider}`);
    return adapter.connect(authData, userId);
  }

  /**
   * Performs health check across all registered integrations for the user.
   */
  public async checkHealth(userId: string): Promise<Record<string, { healthy: boolean; details?: string }>> {
    const result: Record<string, { healthy: boolean; details?: string }> = {};
    for (const [provider, adapter] of this.adapters.entries()) {
      try {
        result[provider] = await adapter.healthCheck(userId);
      } catch (err: any) {
        result[provider] = { healthy: false, details: err.message };
      }
    }
    return result;
  }

  /**
   * Refreshes credentials for a provider.
   */
  public async refreshProviderToken(provider: string, userId: string): Promise<string> {
    const adapter = this.getAdapter(provider);
    if (!adapter) throw new Error(`Unsupported integration provider: ${provider}`);
    return adapter.refreshToken(userId);
  }

  /**
   * Disconnects a provider.
   */
  public async disconnectProvider(provider: string, userId: string): Promise<void> {
    const adapter = this.getAdapter(provider);
    if (adapter) {
      await adapter.disconnect(userId);
    }
  }

  /**
   * Pulls messages from all active integrations for user.
   */
  public async fetchAllMessages(userId: string): Promise<NormalizedMessage[]> {
    const activeIntegrations = await db.getIntegrations(userId);
    const connectedProviders = activeIntegrations
      .filter(i => i.status === 'CONNECTED')
      .map(i => i.provider.toLowerCase());

    const allMessages: NormalizedMessage[] = [];

    for (const provider of connectedProviders) {
      const adapter = this.getAdapter(provider);
      if (adapter) {
        try {
          const messages = await adapter.fetchMessages(userId);
          allMessages.push(...messages);
        } catch (err) {
          console.error(`[IntegrationManager] Error fetching messages from ${provider}:`, err);
        }
      }
    }

    return allMessages;
  }
}

export const integrationManager = new IntegrationManager();
