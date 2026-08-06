#!/usr/bin/env bash
# ── ShimmerStock Database Backup ──────────────────────────────────────────
# Creates an encrypted, compressed backup of the SQLite database.
#
# Prerequisites:
#   - ENCRYPTION_KEY environment variable (64-char hex string for AES-256)
#   - sqlite3, gzip, openssl available on PATH
#
# Usage:
#   ENCRYPTION_KEY=... ./scripts/backup.sh
#   ENCRYPTION_KEY=... bash scripts/backup.sh
#   ENCRYPTION_KEY=... SHIMMERSTOCK_BACKUP_DIR=/data/backups ./scripts/backup.sh
#
# Cron example (runs daily at 2am):
#   0 2 * * * ENCRYPTION_KEY=... /opt/shimmerstock/scripts/backup.sh
# ──────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${SHIMMERSTOCK_BACKUP_DIR:-${PROJECT_DIR}/backups}"
LOG_FILE="${BACKUP_DIR}/backup.log"
DB_PATH="${SHIMMERSTOCK_DB_PATH:-${PROJECT_DIR}/shimmerstock.db}"
TIMESTAMP="$(date +%Y-%m-%d-%H%M%S)"
BACKUP_BASENAME="shimmerstock-${TIMESTAMP}"
BACKUP_TMP="${BACKUP_DIR}/${BACKUP_BASENAME}.db.gz"
BACKUP_FILE="${BACKUP_TMP}.enc"
VERIFY_DIR=""

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
  echo "$msg"
  echo "$msg" >> "$LOG_FILE"
}

fail() {
  log "FATAL: $1"
  exit 1
}

cleanup() {
  if [ -n "$VERIFY_DIR" ] && [ -d "$VERIFY_DIR" ]; then
    rm -rf "$VERIFY_DIR"
  fi
}

trap cleanup EXIT

# ── Preflight checks ─────────────────────────────────────────────────────

if [ -z "${ENCRYPTION_KEY:-}" ]; then
  fail "ENCRYPTION_KEY environment variable is not set. Generate one with: openssl rand -hex 32"
fi

if [ ! -f "$DB_PATH" ]; then
  fail "Database file not found: $DB_PATH"
fi

mkdir -p "$BACKUP_DIR"

for cmd in sqlite3 gzip openssl; do
  if ! command -v "$cmd" &>/dev/null; then
    fail "Required command not found: $cmd"
  fi
done

# ── Backup ───────────────────────────────────────────────────────────────

log "Starting backup of $DB_PATH"

# Step 1: Use sqlite3 .backup for a consistent WAL-safe copy
sqlite3 "$DB_PATH" ".backup '${BACKUP_DIR}/${BACKUP_BASENAME}.db'" || fail "sqlite3 .backup failed"

# Step 2: Compress with gzip
gzip -f "${BACKUP_DIR}/${BACKUP_BASENAME}.db" || fail "gzip compression failed"

# Step 3: Encrypt with AES-256-CBC using the ENCRYPTION_KEY as the passphrase
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
  -in "$BACKUP_TMP" \
  -out "$BACKUP_FILE" \
  -pass "pass:${ENCRYPTION_KEY}" \
  || fail "openssl encryption failed"

# Step 4: Clean up intermediate file
rm -f "$BACKUP_TMP"

# Step 5: Verify the backup was created and has non-zero size
if [ ! -f "$BACKUP_FILE" ] || [ ! -s "$BACKUP_FILE" ]; then
  fail "Backup file is empty or missing: $BACKUP_FILE"
fi

# Step 6: Verify the encrypted backup can be restored into a consistent SQLite DB
VERIFY_DIR="$(mktemp -d "${BACKUP_DIR}/verify-${BACKUP_BASENAME}-XXXXXX")"
VERIFY_GZ="${VERIFY_DIR}/${BACKUP_BASENAME}.db.gz"
VERIFY_DB="${VERIFY_DIR}/${BACKUP_BASENAME}.db"

openssl enc -aes-256-cbc -d -salt -pbkdf2 -iter 100000 \
  -in "$BACKUP_FILE" \
  -out "$VERIFY_GZ" \
  -pass "pass:${ENCRYPTION_KEY}" \
  || fail "Backup verification decrypt failed"

gunzip -f "$VERIFY_GZ" || fail "Backup verification decompress failed"

if ! sqlite3 "$VERIFY_DB" "PRAGMA integrity_check;" 2>/dev/null | grep -q "ok"; then
  fail "Backup verification integrity check failed"
fi

TABLE_COUNT="$(sqlite3 "$VERIFY_DB" "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table';" 2>/dev/null || true)"
if [ -z "$TABLE_COUNT" ] || [ "$TABLE_COUNT" -lt 1 ]; then
  fail "Backup verification readiness check failed"
fi

log "Backup verification passed"

BACKUP_SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
log "Backup complete: $BACKUP_FILE ($BACKUP_SIZE)"
echo "$BACKUP_FILE"
