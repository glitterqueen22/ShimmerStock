/**
 * Token encryption utility for Shopify OAuth.
 *
 * Uses AES-256-GCM for encrypting access tokens before storage in the database.
 *
 * Environment:
 *   ENCRYPTION_KEY — 32-byte hex string (64 hex chars) for AES-256.
 *                    Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *                    Falls back to a derived key in dev.
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Derive a 32-byte key from the environment or fallback.
 * In production, always set ENCRYPTION_KEY.
 */
function getEncryptionKey() {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey && envKey.length === 64) {
    return Buffer.from(envKey, "hex");
  }

  // Dev fallback — deterministic 32-byte key derived from a fixed seed
  // NOT SECURE FOR PRODUCTION — only used when ENCRYPTION_KEY is not set
  const fallbackSeed = "shimmerstock-shopify-oauth-dev-key-v1";
  return crypto.createHash("sha256").update(fallbackSeed).digest();
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

console.log("[crypto-utils] Token encryption utility loaded");
