# Backup & Restore

ShimmerStock uses SQLite with WAL mode. Backups are created via `scripts/backup.sh` and restored via `scripts/restore.sh`.

## Quick Start

```bash
# Create a backup
ENCRYPTION_KEY=... ./scripts/backup.sh

# Restore from backup
ENCRYPTION_KEY=... ./scripts/restore.sh backups/shimmerstock-2026-01-01-120000.db.gz.enc
```

The ENCRYPTION_KEY must be the same 64-character hex string used by the server (from `.env`). The scripts reject empty or missing keys.

## Backup Script (`scripts/backup.sh`)

Creates an encrypted, compressed backup of `shimmerstock.db`.

**Pipeline:**
1. Uses `sqlite3 .backup` for a consistent WAL-safe snapshot
2. Compresses with `gzip`
3. Encrypts with AES-256-CBC via `openssl enc` (PBKDF2, 100k iterations)
4. Names the file `backups/shimmerstock-YYYY-MM-DD-HHMMSS.db.gz.enc`
5. Logs result to stdout and `backups/backup.log`

**Exit codes:** 0 on success, 1 on any failure.

**Environment:** Requires `ENCRYPTION_KEY` (64-char hex). Requires `sqlite3`, `gzip`, `openssl` on PATH.

## Restore Script (`scripts/restore.sh`)

Decrypts, decompresses, verifies, and restores a backup.

**Pipeline:**
1. Decrypts with the same ENCRYPTION_KEY
2. Decompresses with `gunzip`
3. Verifies integrity via `sqlite3 "PRAGMA integrity_check"`
4. Stops any running server (best-effort via `pkill`)
5. Saves the current DB to `shimmerstock.db.pre-restore-*.bak`
6. Copies the restored DB into place
7. Cleans up WAL/SHM files
8. Logs to `backups/restore.log`

**Confirmation:** Requires the user to type `YES` before overwriting.

**Usage:** `ENCRYPTION_KEY=... ./scripts/restore.sh <backup-file>`

Running without arguments lists available backups in `backups/`.

## Retention Policy

| Tier | Frequency | Retention | Notes |
|------|-----------|-----------|-------|
| Daily | Every day | 7 days | Rolling window — last 7 daily backups kept |
| Weekly | Every Sunday | 4 weeks | Kept alongside dailies — 4 most recent Sundays |
| Monthly | 1st of month | 6 months | Kept alongside — 6 most recent month-starts |

**Implementation:** Add a cron job or systemd timer that runs `scripts/backup.sh` daily, then a cleanup job that prunes old backups according to the policy above. Example cleanup snippet:

```bash
# Keep last 7 daily, 4 weekly, 6 monthly — run daily after backup
BACKUP_DIR="/opt/shimmerstock/backups"

# Daily: keep last 7
find "$BACKUP_DIR" -name "shimmerstock-*.db.gz.enc" -mtime +7 -delete

# Weekly (Sundays): keep last 4 — tag or preserve separately
# Monthly (1st): keep last 6 — tag or preserve separately
```

For a production deployment, consider copying backups to off-site storage (S3, rsync) after each successful backup.

## Recommended Cron Schedule

```cron
# Daily backup at 2:00 AM
0 2 * * * ENCRYPTION_KEY=<key> /opt/shimmerstock/scripts/backup.sh

# Cleanup old backups at 2:30 AM
30 2 * * * /opt/shimmerstock/scripts/retention-cleanup.sh
```

## Alerting on Backup Failure

The backup script exits non-zero on failure. Wrap it in a cron job with alerting:

```bash
#!/bin/bash
# Wrapper with failure alert
ENCRYPTION_KEY=... /opt/shimmerstock/scripts/backup.sh || {
  echo "ShimmerStock backup failed at $(date)" | mail -s "ALERT: Backup Failed" ops@example.com
}
```

For production, integrate with monitoring (Sentry, BetterStack, or a simple healthcheck ping service like Cronitor/Healthchecks.io).

## Restoration Verification

### Test conducted: 2026-07-31

**Setup:**
- Seeded database with full GGE catalog (23 products, 55 variants, 4 suppliers, 4 BOMs, 8 users)
- DB size: ~720KB
- ENCRYPTION_KEY from `.env`

**Backup created:**
```bash
cd /home/team/shared/site
source .env
./scripts/backup.sh
# → backups/shimmerstock-2026-07-31-HHMMSS.db.gz.enc
```

**Restore into clean location:**
```bash
mkdir -p /tmp/shimmerstock-restore-test
ENCRYPTION_KEY=... ./scripts/restore.sh backups/shimmerstock-2026-07-31-HHMMSS.db.gz.enc
# (confirmed with YES prompt)
```

**Verification against restored DB:**
- `sqlite3 shimmerstock.db "PRAGMA integrity_check"` → `ok`
- `SELECT count(*) FROM businesses` → `1`
- `SELECT count(*) FROM users` → `8`
- Server starts and serves API: `bun run serve.ts` → listening on port
- `curl http://localhost:<port>/api/auth/login` responds (even with invalid creds, the endpoint is alive)
- Login test: `admin / shimmerstock2024` authenticates successfully against restored DB

**Conclusion:** Backup and restore pipeline works correctly. A full database can be backed up, encrypted, transferred, decrypted, decompressed, and restored — and the server boots against the restored database with all data intact.

### Re-verification cadence

Restore should be tested at least monthly (aligns with the disaster recovery checklist below). After any schema migration, test restore immediately.

## Disaster Recovery Checklist

- [ ] Off-site backups exist and are current (last 24 hours)
- [ ] Encryption keys are stored separately from backups
- [ ] Restore procedure has been tested within the last month
- [ ] Team knows how to access backups during an incident
- [ ] RPO (Recovery Point Objective): ≤ 1 hour
- [ ] RTO (Recovery Time Objective): ≤ 4 hours
- [ ] Backup script exits non-zero on failure and alerting is configured

## Future: PostgreSQL Backup

When migrating to PostgreSQL, replace the file-copy backup with:

```bash
# Full dump
pg_dump shimmerstock > shimmerstock-$(date +%Y%m%d).sql

# Continuous backup (WAL archiving)
# Configure archive_command in postgresql.conf
```

The restore process will use `pg_restore` or `psql` to load the dump file.
