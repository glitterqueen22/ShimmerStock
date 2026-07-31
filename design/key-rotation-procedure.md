# Key Rotation Procedure — ShimmerStock

**Date:** 2026-07-31  
**Audience:** Owner / admin with shell access to the server  
**Prerequisites:** Access to the server running ShimmerStock, Shopify Partner Dashboard access

---

## Table of Contents

1. [What Gets Rotated and When](#1-what-gets-rotated-and-when)
2. [Step-by-Step Rotation Instructions](#2-step-by-step-rotation-instructions)
   - [ENCRYPTION_KEY](#21-encryption_key)
   - [ADMIN / OWNER Passwords](#22-admin--owner-passwords)
   - [SHOPIFY_CLIENT_SECRET](#23-shopify_client_secret)
   - [SHOPIFY_API_TOKEN](#24-shopify_api_token)
3. [Encryption Key Rotation: Impact and Recovery](#3-encryption-key-rotation-impact-and-recovery)
4. [Emergency Rotation (Compromised Secret)](#4-emergency-rotation-compromised-secret)
5. [Rotation Schedule](#5-rotation-schedule)

---

## 1. What Gets Rotated and When

| Secret | Location | How It's Used | Rotation Trigger |
|--------|----------|---------------|------------------|
| **ENCRYPTION_KEY** | `.env` | AES-256-GCM key for encrypting Shopify OAuth tokens in the database | Routine (every 90 days), or immediately if compromised |
| **ADMIN_INITIAL_PASSWORD** | `.env` + DB (`users` table, bcrypt hash) | Seeds the `admin` user on first DB creation | Routine (every 90 days), on team changes, or if compromised |
| **OWNER_INITIAL_PASSWORD** | `.env` + DB (`users` table, bcrypt hash) | Seeds the `owner` user on first DB creation | Routine (every 90 days), or if compromised |
| **SHOPIFY_CLIENT_SECRET** | Shopify Partner Dashboard → `.env` | Authenticates ShimmerStock to Shopify Admin API | If compromised, or when rotating Shopify app credentials |
| **SHOPIFY_API_TOKEN** | Shopify Partner Dashboard → Database (encrypted by ENCRYPTION_KEY) | Legacy API access (fallback when no OAuth) | If compromised, or when rotating Shopify app credentials |
| **Session tokens** | Database (`sessions` table) | Authenticate logged-in users | Auto-expire (configurable TTL); rotate by restarting server if needed |

**Secrets NOT present in this codebase (no rotation needed):**
- SESSION_SECRET / JWT_SECRET — not used; sessions use random DB-stored tokens
- Database passwords — SQLite is file-based, no connection password
- API keys for third-party services — none integrated yet

---

## 2. Step-by-Step Rotation Instructions

### 2.1 ENCRYPTION_KEY

The ENCRYPTION_KEY is the most critical secret. It encrypts all Shopify OAuth access tokens stored in the `provider_credentials` table. **Rotating this key will break decryption of all existing tokens** — see Section 3 for the full impact and recovery procedure.

#### Pre-Rotation Checklist

- [ ] Confirm you have access to the Shopify Partner Dashboard to re-authenticate any connected stores
- [ ] Identify all businesses with active Shopify connections: `SELECT business_id, store_domain FROM provider_credentials WHERE provider = 'shopify' AND is_active = 1;`
- [ ] Notify any affected store owners of a brief Shopify disconnection
- [ ] Schedule rotation during low-traffic hours
- [ ] Take a database backup (see `BACKUP.md`)

#### Rotation Steps

1. **Generate a new key:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   This produces a 64-character hex string. Save it securely.

2. **Decrypt and record all existing Shopify tokens** (before changing the key):
   ```bash
   # Using the CURRENT key, export all tokens to a secure temporary file
   # This requires a small script or manual DB query since decryption
   # depends on the current ENCRYPTION_KEY
   ```
   See Section 3 for the detailed re-encryption script.

3. **Stop the server:**
   ```bash
   # Find and stop the running process
   sudo lsof -ti:3000 | xargs kill
   ```

4. **Update `.env`:**
   ```bash
   # Replace the old key with the new one
   ENCRYPTION_KEY=<new-64-char-hex-key>
   ```

5. **Re-encrypt stored tokens** (see Section 3 for script).

6. **Start the server:**
   ```bash
   cd /home/team/shared/site && bun run serve.ts
   ```

#### Post-Rotation Verification

- [ ] Server starts without ENCRYPTION_KEY errors
- [ ] Log in to the app and verify Shopify connections show as "Connected"
- [ ] Trigger a test Shopify sync (e.g., import a product or order)
- [ ] Verify no decryption errors in server logs
- [ ] Securely destroy the old key — do not leave it in shell history, logs, or temp files

---

### 2.2 ADMIN / OWNER Passwords

These are **seed-only** values — they only take effect when the database is first created (no `users` table exists). For an existing database, use the in-app password change flow.

#### For an Existing Database (Recommended)

1. Log in to ShimmerStock as the user whose password you want to change.
2. Navigate to the profile/account settings area.
3. Use the "Change Password" form.
4. Verify by logging out and logging back in with the new password.

#### For `.env` Seed Passwords

1. Update `.env`:
   ```bash
   ADMIN_INITIAL_PASSWORD=<new-strong-password>
   OWNER_INITIAL_PASSWORD=<new-strong-password>
   ```
2. These values only matter if the database is ever recreated from scratch. For an existing database, the in-app password change is the authoritative method.
3. Use distinct passwords for admin and owner — do not reuse.

#### Password Requirements

- Minimum 12 characters
- Mix of uppercase, lowercase, numbers, and symbols
- Not based on the project name, company name, or current year
- Use a password manager to generate and store

---

### 2.3 SHOPIFY_CLIENT_SECRET

The Shopify Client Secret is managed in the **Shopify Partner Dashboard**, not in ShimmerStock's code. ShimmerStock only stores it in `.env`.

#### Rotation Steps

1. **In Shopify Partner Dashboard:**
   - Go to **Apps** → Select your ShimmerStock app
   - Under **App credentials**, click **Rotate client secret**
   - Copy the new secret immediately — Shopify only shows it once

2. **Update `.env` on the server:**
   ```bash
   SHOPIFY_CLIENT_SECRET=<new-client-secret>
   ```

3. **Restart the server** (required to pick up the new env var):
   ```bash
   sudo lsof -ti:3000 | xargs kill
   cd /home/team/shared/site && bun run serve.ts
   ```

4. **Verify:** Log in, navigate to Commerce/Shopify settings, trigger a test connection.

#### Important Note

Rotating the Client Secret does **not** invalidate existing OAuth access tokens. Connected stores will remain connected. Only new OAuth authorizations will use the new secret for the handshake.

---

### 2.4 SHOPIFY_API_TOKEN

The legacy Shopify API token is a per-store admin API token generated in the Shopify admin (not the Partner Dashboard). It is encrypted with ENCRYPTION_KEY and stored in the `provider_credentials` table.

#### Rotation Steps

1. **In Shopify Admin** (for each connected store):
   - Go to **Settings** → **Apps and sales channels** → **Develop apps**
   - Select the ShimmerStock app → **API credentials**
   - Click **Rotate admin API token**

2. **In ShimmerStock:**
   - Navigate to the Commerce/Shopify settings for that business
   - Enter the new API token in the connection form
   - The token will be encrypted with the current ENCRYPTION_KEY and stored

3. **Verify:** Trigger a test sync to confirm the new token works.

---

## 3. Encryption Key Rotation: Impact and Recovery

### What Happens When the ENCRYPTION_KEY Changes

The ENCRYPTION_KEY is used by `server/crypto-utils.js` to encrypt/decrypt Shopify access tokens with AES-256-GCM. Every encrypted token in the `provider_credentials` table was encrypted with the **current** key.

**If you change the key without re-encrypting the stored tokens:**
- All existing Shopify connections will **break**
- Any attempt to use a stored token will fail with an authentication error
- The Shopify OAuth flow will fail during token refresh
- New OAuth connections will work fine (they'll be encrypted with the new key)
- **No data is lost** — the tokens still exist, they just can't be decrypted with the new key

### Recovery Procedure: Re-encrypt Tokens During Rotation

The safest approach is a scripted re-encryption that runs during the rotation window.

#### Step-by-Step Re-encryption

1. **While the server is still running with the OLD key**, run a re-encryption script:

   ```javascript
   // save as /tmp/reencrypt-tokens.js
   import Database from "better-sqlite3";
   import crypto from "crypto";

   const DB_PATH = "/home/team/shared/site/shimmerstock.db";
   const OLD_KEY = Buffer.from(process.argv[2], "hex"); // old ENCRYPTION_KEY
   const NEW_KEY = Buffer.from(process.argv[3], "hex"); // new ENCRYPTION_KEY

   const db = new Database(DB_PATH);

   function decryptWithKey(key, encrypted) {
     const buf = Buffer.from(encrypted, "base64");
     const iv = buf.subarray(0, 16);
     const authTag = buf.subarray(16, 32);
     const ciphertext = buf.subarray(32);
     const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
     decipher.setAuthTag(authTag);
     let decrypted = decipher.update(ciphertext);
     decrypted = Buffer.concat([decrypted, decipher.final()]);
     return decrypted.toString("utf8");
   }

   function encryptWithKey(key, plaintext) {
     const iv = crypto.randomBytes(16);
     const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
     let encrypted = cipher.update(plaintext, "utf8", "base64");
     encrypted += cipher.final("base64");
     const authTag = cipher.getAuthTag();
     return Buffer.concat([iv, authTag, Buffer.from(encrypted, "base64")]).toString("base64");
   }

   // Re-encrypt all Shopify credentials
   const rows = db.prepare(
     "SELECT id, access_token FROM provider_credentials WHERE provider = 'shopify' AND access_token IS NOT NULL"
   ).all();

   for (const row of rows) {
     try {
       const plaintext = decryptWithKey(OLD_KEY, row.access_token);
       const reencrypted = encryptWithKey(NEW_KEY, plaintext);
       db.prepare("UPDATE provider_credentials SET access_token = ? WHERE id = ?")
         .run(reencrypted, row.id);
       console.log(`Re-encrypted credential row ${row.id}`);
     } catch (err) {
       console.error(`FAILED to re-encrypt row ${row.id}: ${err.message}`);
     }
   }

   console.log("Re-encryption complete.");
   ```

2. **Run the script:**
   ```bash
   bun run /tmp/reencrypt-tokens.js <OLD_KEY_HEX> <NEW_KEY_HEX>
   ```

3. **Then** update `.env` with the new key and restart the server.

### If You've Already Changed the Key and Connections Are Broken

1. **Revert** `.env` to the old ENCRYPTION_KEY.
2. **Restart** the server — connections should work again.
3. **Follow** the re-encryption procedure above.
4. **Switch** to the new key after re-encryption is confirmed.

### If You've Lost the Old Key

If the old ENCRYPTION_KEY is permanently lost but stored tokens exist:
- The encrypted tokens are **unrecoverable**
- You must **re-authenticate** every connected Shopify store via OAuth
- This requires each store owner to go through the OAuth flow again
- Data loss is limited to the encrypted tokens themselves — no business data is affected

---

## 4. Emergency Rotation (Compromised Secret)

If you confirm or strongly suspect a secret has been compromised (leaked, exposed in logs, shared accidentally, etc.), follow this accelerated procedure.

### Immediate Actions (First 15 Minutes)

1. **Assess scope:**
   - Which secret was compromised?
   - Who had access? For how long?
   - Was it in git history, logs, screenshots, chat messages?

2. **If ENCRYPTION_KEY was compromised:**
   - Immediately stop the server: `sudo lsof -ti:3000 | xargs kill`
   - The attacker could decrypt all stored Shopify tokens
   - Revoke all Shopify access tokens from the Shopify Partner Dashboard
   - Generate a new ENCRYPTION_KEY
   - Do NOT restart the server until the key is rotated AND all Shopify tokens are revoked/reissued

3. **If ADMIN or OWNER password was compromised:**
   - Log in and change the password immediately
   - Review the audit log (`/api/audit-log`) for suspicious activity
   - Check for unauthorized session tokens in the `sessions` table
   - Consider revoking all sessions: `DELETE FROM sessions;` (forces all users to re-login)

4. **If SHOPIFY_CLIENT_SECRET was compromised:**
   - Rotate immediately in Shopify Partner Dashboard
   - Update `.env` and restart the server
   - Existing OAuth tokens remain valid (rotation doesn't invalidate them)
   - Monitor for suspicious API activity in Shopify Partner Dashboard

5. **If SHOPIFY_API_TOKEN was compromised:**
   - Revoke the token in the Shopify store admin immediately
   - Generate a new token and update in ShimmerStock
   - Review recent API calls for unauthorized access

### Follow-up (Within 24 Hours)

- [ ] Review all server access logs for the compromise window
- [ ] Check for any data exfiltration or unauthorized configuration changes
- [ ] Notify affected parties if customer data may have been accessed
- [ ] Document the incident: what was compromised, how, impact, resolution
- [ ] Update the rotation schedule — consider shortening intervals temporarily
- [ ] Run a new secret scan to confirm no residual exposure

### Prevention Checklist

- [ ] `.env` is in `.gitignore` ✅ (confirmed)
- [ ] No secrets in git history ✅ (confirmed by scan)
- [ ] Server logs do not capture environment variables
- [ ] Shell history is cleared after entering secrets
- [ ] Database file permissions restrict read access
- [ ] Consider a pre-commit hook: `trufflehog git file://. --since-commit HEAD~1 --no-update`

---

## 5. Rotation Schedule

| Secret | Routine Rotation | Notes |
|--------|-----------------|-------|
| **ENCRYPTION_KEY** | Every 90 days | Requires re-encrypting stored tokens (or re-authenticating Shopify connections). Schedule during maintenance window. |
| **ADMIN_INITIAL_PASSWORD** | Every 90 days + on team changes | Only affects new DB creation. Use in-app password change for existing DB. |
| **OWNER_INITIAL_PASSWORD** | Every 90 days + on team changes | Same as admin — seed-only. |
| **SHOPIFY_CLIENT_SECRET** | Every 180 days or per Shopify recommendations | Does not invalidate existing tokens. Low-impact rotation. |
| **SHOPIFY_API_TOKEN** | Every 180 days or when store admin changes | Per-store rotation. Requires update in ShimmerStock UI. |
| **Session tokens** | Auto-expire (default: 7 days) | Configured in `server/auth.js`. No manual rotation needed. Restart server to force-expire all sessions. |

### Calendar

Set recurring reminders for the first of:
- **January, April, July, October:** ENCRYPTION_KEY + passwords
- **January, July:** Shopify credentials

---

## Appendix A: Environment Variable Reference

All secrets that ShimmerStock reads from the environment:

| Variable | Required | Type | Purpose |
|----------|----------|------|---------|
| `ENCRYPTION_KEY` | **Yes** | 64-char hex | AES-256-GCM encryption for Shopify tokens |
| `ADMIN_INITIAL_PASSWORD` | No | String | Seeds admin user on first DB creation |
| `OWNER_INITIAL_PASSWORD` | No | String | Seeds owner user on first DB creation |
| `SHOPIFY_CLIENT_ID` | For Shopify | String | Shopify Partner Dashboard app client ID |
| `SHOPIFY_CLIENT_SECRET` | For Shopify | String | Shopify Partner Dashboard app client secret |
| `SHOPIFY_STORE_DOMAIN` | For Shopify | String | Default store domain (e.g., store.myshopify.com) |
| `SHOPIFY_API_TOKEN` | No | String | Legacy API token (fallback, not OAuth) |
| `SHOPIFY_READ_ONLY` | No | Boolean | Sync mode: "true" = read-only, "false" = full |
| `SHIMMERSTOCK_URL` | **Yes** | URL | Public URL for OAuth redirects |
| `PUBLIC_URL` | No | URL | Same as SHIMMERSTOCK_URL (used in referral links) |

---

## Appendix B: Quick Commands Reference

```bash
# Generate a new encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate a secure random password
node -e "console.log(require('crypto').randomBytes(16).toString('base64url'))"

# Stop the server
sudo lsof -ti:3000 | xargs kill

# Start the server (from site directory)
cd /home/team/shared/site && setsid nohup bun run serve.ts > /tmp/shimmerstock.log 2>&1 &

# Check if server is running
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000

# Revoke all sessions (force everyone to re-login)
sqlite3 /home/team/shared/site/shimmerstock.db "DELETE FROM sessions;"

# List active Shopify connections
sqlite3 /home/team/shared/site/shimmerstock.db \
  "SELECT pc.id, b.name, pc.store_domain, pc.created_at
   FROM provider_credentials pc
   JOIN businesses b ON b.id = pc.business_id
   WHERE pc.provider = 'shopify' AND pc.is_active = 1;"
```
