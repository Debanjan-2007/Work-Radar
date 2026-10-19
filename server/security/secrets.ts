import { config } from '../config.js';

/**
 * Safe secrets manager providing runtime validation and preventing accidental exposure of sensitive keys.
 */
export class SecretsManager {
  private static sensitiveKeyPatterns = [
    /key/i,
    /secret/i,
    /token/i,
    /password/i,
    /auth/i
  ];

  /**
   * Sanitizes an object by masking any values corresponding to sensitive keys.
   */
  public static maskSensitiveData(data: Record<string, any>): Record<string, any> {
    const masked: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (this.sensitiveKeyPatterns.some(pattern => pattern.test(key))) {
        masked[key] = '***REDACTED***';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        masked[key] = this.maskSensitiveData(value);
      } else {
        masked[key] = value;
      }
    }
    return masked;
  }

  /**
   * Retrieves an integration secret or returns empty string if not set.
   */
  public static getSecret(key: string): string {
    return process.env[key] || '';
  }

  /**
   * Asserts critical startup secrets are present.
   */
  public static validateStartupSecrets(): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    if (!config.sessionSecret || config.sessionSecret.length < 32) {
      warnings.push('SESSION_SECRET is shorter than 32 characters');
    }
    if (!config.tokenEncryptionKey || config.tokenEncryptionKey.length < 32) {
      warnings.push('TOKEN_ENCRYPTION_KEY is shorter than 32 characters');
    }
    return { valid: warnings.length === 0, warnings };
  }
}
