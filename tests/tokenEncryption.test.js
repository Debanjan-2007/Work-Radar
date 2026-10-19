import test from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const secret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function getEncryptionKey() {
  return crypto.scryptSync(secret, 'work-radar-salt-salt', 32);
}

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${encrypted}:${tag}`;
}

function decrypt(payload) {
  const [ivHex, encHex, tagHex] = payload.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  let dec = decipher.update(encHex, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}

test('TokenEncryption: correctly encrypts and decrypts OAuth token', () => {
  const sampleToken = 'ya29.a0AfH6SMBDGf_OAuth_Secret_Token_String_987654';
  const encrypted = encrypt(sampleToken);
  assert.notStrictEqual(encrypted, sampleToken);
  assert.ok(encrypted.includes(':'));

  const decrypted = decrypt(encrypted);
  assert.strictEqual(decrypted, sampleToken);
});

test('TokenEncryption: throws error if auth tag is tampered', () => {
  const sampleToken = 'secret-token';
  const encrypted = encrypt(sampleToken);
  const parts = encrypted.split(':');
  parts[2] = '00000000000000000000000000000000'; // corrupted auth tag
  const tampered = parts.join(':');

  assert.throws(() => {
    decrypt(tampered);
  });
});
