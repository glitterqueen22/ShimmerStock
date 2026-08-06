# Secret Scan Report — ShimmerStock

**Date:** 2026-07-31  
**Scanner:** truffleHog v2.2.1 (Python) + manual grep-based audit  
**Scope:** Full repository at `/home/team/shared/site/` — current working tree + full git history  
**Methodology:** Automated scan with truffleHog (regex + entropy mode) across git history, plus manual grep for high-signal patterns (passwords, API keys, tokens, private keys, Shopify credentials) across the working tree.

---

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 CRITICAL | 0 | No secrets found in git history or tracked files |
| 🔴 HIGH | 3 | Secrets in `.env` (not tracked): real encryption key, admin/owner passwords |
| 🟡 MEDIUM | 0 | — |
| 🟢 LOW | 2 | Placeholder/test values in `.env` (Shopify CLIENT_ID, CLIENT_SECRET) |
| ⚪ INFO | 1 | Passwords logged to console during seeding |
| ❌ FALSE POSITIVE | 1 | Random character set flagged as high-entropy string |

---

## Detailed Findings

### Finding 1 — Real ENCRYPTION_KEY in `.env` 🔴 HIGH

- **File:** `.env` (not tracked in git, excluded by `.gitignore`)
- **Line:** `ENCRYPTION_KEY=[REDACTED — rotate immediately if exposed]`
- **Severity:** HIGH
- **Detail:** This is the live AES-256-GCM encryption key used to encrypt/decrypt Shopify OAuth access tokens stored in the database. While `.env` is properly gitignored, this key exists on disk in plaintext. Anyone with filesystem access to the server can read it. Additionally, this key has been hardcoded in the sandbox environment rather than injected from a secrets manager.
- **Recommendation:** Rotate immediately if this key has ever been exposed outside the sandbox. In production, inject via a secrets manager (environment-level, not `.env` file). See key-rotation-procedure.md.

### Finding 2 — Real ADMIN_INITIAL_PASSWORD in `.env` 🔴 HIGH

- **File:** `.env` (not tracked in git)
- **Line:** `ADMIN_INITIAL_PASSWORD=[REDACTED — change immediately]`
- **Severity:** HIGH
- **Detail:** This is the password for the `admin` user. The password `[REDACTED — change immediately]` is weak (predictable pattern: project name + year) and shared between admin and owner. It has existed since initial setup.
- **Recommendation:** Change immediately via the app's password change flow. Do not reuse across accounts. See key-rotation-procedure.md.

### Finding 3 — Real OWNER_INITIAL_PASSWORD in `.env` 🔴 HIGH

- **File:** `.env` (not tracked in git)
- **Line:** `OWNER_INITIAL_PASSWORD=[REDACTED — change immediately]`
- **Severity:** HIGH
- **Detail:** Same weak password as admin, for the `owner` user. Shared credentials between admin and owner accounts defeat the purpose of role separation.
- **Recommendation:** Change immediately. Use distinct passwords for admin and owner. See key-rotation-procedure.md.

### Finding 4 — Placeholder Shopify Credentials in `.env` 🟢 LOW

- **File:** `.env` (not tracked in git)
- **Lines:**
  - `SHOPIFY_CLIENT_ID=test_shopify_client_id`
  - `SHOPIFY_CLIENT_SECRET=test_shopify_client_secret`
- **Severity:** LOW
- **Detail:** These are non-functional placeholder values used for local development. They do not grant access to any real Shopify store.
- **Recommendation:** Replace with real credentials from Shopify Partner Dashboard before connecting to a live store. These are not secrets currently but confirm they are placeholders.

### Finding 5 — Password Logged to Console During Seeding ⚪ INFO

- **File:** `server/db.js` (lines 672–675, 696–698)
- **Detail:** When the database initializes and seeds the admin/owner users, the generated password is printed to stdout:
  ```
  console.log(`     Password: ${password}`);
  ```
  If `ADMIN_INITIAL_PASSWORD` or `OWNER_INITIAL_PASSWORD` env vars are set, those real passwords are echoed to the server logs.
- **Recommendation:** Mask or suppress the password output. Only log that the user was created, not the credential.

### Finding 6 — truffleHog False Positive ❌ FALSE POSITIVE

- **File:** `server/affiliate-attribution-store.js`
- **Line:** N/A (was present in a historical diff — the file was deleted in a later commit)
- **Reason:** High Entropy
- **String flagged:** `abcdefghijklmnopqrstuvwxyz0123456789`
- **Verdict:** FALSE POSITIVE. This is a character set literal used by `generateLinkCode()` to create random referral link codes. It is not a secret.

---

## What Was NOT Found

The following were specifically searched for and **not found** anywhere in the codebase or git history:

- ❌ Hardcoded Shopify API tokens (`shpat_*`, `shpca_*`, `shpua_*`)
- ❌ SESSION_SECRET or JWT_SECRET (sessions use random DB-stored tokens, no shared secret)
- ❌ Private keys (no `-----BEGIN` blocks)
- ❌ Database connection strings with embedded passwords
- ❌ AWS/cloud provider access keys
- ❌ GitHub tokens or deploy keys
- ❌ Slack/Discord webhook URLs with secrets
- ❌ Any secrets committed to git history (the P0.2 cleanup was thorough)

---

## Verification Notes

- `.env` is properly listed in `.gitignore` and is **not tracked** by git (`git ls-files .env` returns empty).
- No git commit in the 6-commit history contains the current `ENCRYPTION_KEY` or `[REDACTED — change immediately]` passwords.
- The P0.2 credential rotation commit (5318d6b) successfully removed the hardcoded fallback encryption key from `crypto-utils.js`.
- Shopify credential placeholders (`SHOPIFY_CLIENT_SECRET`, `SHOPIFY_API_TOKEN`) in source code are only used as form field labels/references, not as actual values.

---

## Next Steps

1. **Rotate** the ENCRYPTION_KEY, ADMIN_INITIAL_PASSWORD, and OWNER_INITIAL_PASSWORD using the procedure in `key-rotation-procedure.md`.
2. **Replace** the placeholder Shopify credentials with real values when connecting a live store.
3. **Suppress** password logging in `server/db.js` (mask or remove the console.log on lines 674 and 698).
4. **Add** `.env` to a `.dockerignore` or deployment ignore list if containerizing.
5. **Consider** a pre-commit hook that runs `truffleHog` or `gitleaks` to prevent accidental secret commits.
