import crypto from 'crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Derives a 32-byte key from the configured secret key.
 */
function getEncryptionKey(): Buffer {
  return crypto.scryptSync(config.tokenEncryptionKey, 'work-radar-salt-salt', 32);
}

/**
 * Encrypts a plaintext string (such as an OAuth access/refresh token) using AES-256-GCM.
 * Formats output as: iv:ciphertext:authTag (all hex-encoded).
 */
export function encryptToken(plainText: string): string {
  if (!plainText) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${encrypted}:${authTag}`;
}

/**
 * Decrypts an AES-256-GCM encrypted token.
 * Validates integrity via the authentication tag.
 */
export function decryptToken(encryptedPayload: string): string {
  if (!encryptedPayload) return '';
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }

  const [ivHex, encryptedHex, authTagHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = getEncryptionKey();

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
