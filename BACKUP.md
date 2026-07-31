# Backup & Restore

## Current Approach (SQLite)

ShimmerStock uses SQLite, which stores the entire database in a single file: `shimmerstock.db`.

### Backup

Copy the database file while the server is running (WAL mode makes this safe):

```bash
# Simple file copy
cp shimmerstock.db shimmerstock.db.backup.$(date +%Y%m%d-%H%M%S)

# Using SQLite backup API
sqlite3 shimmerstock.db ".backup 'shimmerstock.db.backup.$(date +%Y%m%d-%H%M%S)'"
```

### Automated Backup Script

```bash
#!/bin/bash
# /opt/shimmerstock/backup.sh
BACKUP_DIR="/opt/backups/shimmerstock"
DB_PATH="/opt/shimmerstock/shimmerstock.db"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/shimmerstock-$TIMESTAMP.db'"

# Keep last 30 days of backups
find "$BACKUP_DIR" -name "*.db" -mtime +30 -delete

echo "Backup complete: shimmerstock-$TIMESTAMP.db"
```

### Recommended Schedule

| Frequency | Retention |
|-----------|-----------|
| Hourly | 24 hours |
| Daily | 30 days |
| Weekly | 12 weeks |

Use cron for scheduling:

```cron
0 * * * * /opt/shimmerstock/backup.sh  # Hourly
```

### Restore

```bash
# Stop the server first
systemctl stop shimmerstock

# Restore from backup
cp /opt/backups/shimmerstock/shimmerstock-20260101-120000.db shimmerstock.db

# Clean up WAL files
rm -f shimmerstock.db-wal shimmerstock.db-shm

# Start the server
systemctl start shimmerstock
```

### Verify Backup

After taking a backup, verify it:

```bash
sqlite3 shimmerstock.db.backup "SELECT count(*) FROM businesses;"
sqlite3 shimmerstock.db.backup "PRAGMA integrity_check;"
```

## Encryption

Backup files should be encrypted at rest:

```bash
# Encrypt
gpg --encrypt --recipient ops@example.com shimmerstock.db.backup

# Decrypt for restore
gpg --decrypt shimmerstock.db.backup.gpg > shimmerstock.db
```

## Off-Site Storage

Copy backups to remote storage:

```bash
# AWS S3
aws s3 cp shimmerstock.db.backup.gpg s3://shimmerstock-backups/

# Rsync
rsync -avz /opt/backups/shimmerstock/ backup-server:/backups/shimmerstock/
```

## Future: PostgreSQL Backup

When migrating to PostgreSQL, replace file-copy backup with:

```bash
# Full dump
pg_dump shimmerstock > shimmerstock-$(date +%Y%m%d).sql

# Continuous backup (WAL archiving)
# Configure archive_command in postgresql.conf
```

The restore process will use `pg_restore` or `psql` to load the dump file.

## Disaster Recovery Checklist

- [ ] Off-site backups exist and are current
- [ ] Encryption keys are stored separately from backups
- [ ] Restore procedure has been tested within the last month
- [ ] Team knows how to access backups during an incident
- [ ] RPO (Recovery Point Objective): ≤ 1 hour
- [ ] RTO (Recovery Time Objective): ≤ 4 hours
