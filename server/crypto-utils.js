/**
 * Token encryption utility for Shopify OAuth.
 *
 * Uses AES-256-GCM for encrypting access tokens before storage in the database.
 *
 * Environment:
 *   ENCRYPTION_KEY — 32-byte hex string (64 hex chars) for AES-256 (REQUIRED).
 *                    Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *                    The server will refuse to start if this is not set.
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/** @type {Buffer|null} — initialized once at startup, throws if ENCRYPTION_KEY is missing */
let _encryptionKey = null;

/**
 * Lazily load and validate the encryption key from environment.
 * Throws a clear error on first call if ENCRYPTION_KEY is missing or invalid.
 * Cached after first successful load.
 */
function getEncryptionKey() {
  if (_encryptionKey) return _encryptionKey;

  const envKey = process.env.ENCRYPTION_KEY;
  if (!envKey) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is not set. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" " +
      "and add it to your .env file. The server cannot start without it."
    );
  }

  if (envKey.length !== 64) {
    throw new Error(
      `ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes), got ${envKey.length} characters. ` +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }

  _encryptionKey = Buffer.from(envKey, "hex");
  return _encryptionKey;
}

/**
 * Encrypt a plaintext string.
 * Returns a base64-encoded string containing IV + auth tag + ciphertext.
 *
 * @param {string} plaintext — the value to encrypt
 * @returns {string} base64-encoded encrypted payload
 */
export function encryptToken(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  // Combine: iv (16 bytes) + authTag (16 bytes) + encrypted (base64)
  const combined = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, "base64"),
  ]);

  return combined.toString("base64");
}

/**
 * Decrypt a base64-encoded payload produced by encryptToken.
 *
 * @param {string} encrypted — the encrypted payload from encryptToken
 * @returns {string} the original plaintext
 */
export function decryptToken(encrypted) {
  const key = getEncryptionKey();
  const combined = Buffer.from(encrypted, "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext.toString("base64"), "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

// Eagerly validate ENCRYPTION_KEY at module load time (before any routes are mounted).
// This ensures the server refuses to start if the key is missing or invalid,
// rather than failing cryptically later when a token is first encrypted/decrypted.
try {
  getEncryptionKey();
} catch (err) {
  console.error("[crypto-utils] FATAL:", err.message);
  process.exit(1);
}

console.log("[crypto-utils] Token encryption utility loaded");
