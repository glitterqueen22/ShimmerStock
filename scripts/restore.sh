#!/usr/bin/env bash
# ── ShimmerStock Database Restore ─────────────────────────────────────────
# Decrypts and restores a backup created by scripts/backup.sh.
#
# Prerequisites:
#   - ENCRYPTION_KEY environment variable (same key used during backup)
#   - gzip, openssl available on PATH
#
# Usage:
#   ENCRYPTION_KEY=... ./scripts/restore.sh backups/shimmerstock-2026-01-01-120000.db.gz.enc
#   ENCRYPTION_KEY=... bash scripts/restore.sh <backup-file>
#   ENCRYPTION_KEY=... SHIMMERSTOCK_BACKUP_DIR=/data/backups ./scripts/restore.sh /data/backups/shimmerstock-2026-01-01-120000.db.gz.enc
# ──────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${SHIMMERSTOCK_BACKUP_DIR:-${PROJECT_DIR}/backups}"
LOG_FILE="${BACKUP_DIR}/restore.log"
DB_PATH="${SHIMMERSTOCK_DB_PATH:-${PROJECT_DIR}/shimmerstock.db}"

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
  echo "$msg"
  echo "$msg" >> "$LOG_FILE"
}

fail() {
  log "FATAL: $1"
  exit 1
}

# ── Argument parsing ─────────────────────────────────────────────────────

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-file>"
  echo ""
  echo "  backup-file   Path to an encrypted backup file (*.db.gz.enc)"
  echo "                created by scripts/backup.sh"
  echo ""
  echo "Environment:"
  echo "  ENCRYPTION_KEY   The 64-char hex key used during backup (required)"
  echo ""
  echo "Available backups:"
  if [ -d "$BACKUP_DIR" ]; then
    ls -1 "$BACKUP_DIR"/*.db.gz.enc 2>/dev/null | while read -r f; do
      echo "  $(basename "$f")  ($(du -h "$f" | cut -f1))"
    done
  fi
  exit 1
fi

BACKUP_FILE="$1"

# ── Preflight checks ─────────────────────────────────────────────────────

if [ -z "${ENCRYPTION_KEY:-}" ]; then
  fail "ENCRYPTION_KEY environment variable is not set."
fi

if [ ! -f "$BACKUP_FILE" ]; then
  fail "Backup file not found: $BACKUP_FILE"
fi

for cmd in gzip openssl sqlite3; do
  if ! command -v "$cmd" &>/dev/null; then
    fail "Required command not found: $cmd"
  fi
done

mkdir -p "$BACKUP_DIR"

# ── Confirmation prompt ──────────────────────────────────────────────────

log "⚠️  WARNING: This will overwrite the current database at:"
log "    $DB_PATH"
log "    Any data not in this backup will be permanently lost."
echo ""
read -r -p "Are you sure you want to proceed? Type 'YES' to confirm: " CONFIRM
if [ "$CONFIRM" != "YES" ]; then
  log "Restore cancelled by user."
  exit 0
fi

# ── Restore ──────────────────────────────────────────────────────────────

log "Starting restore from: $BACKUP_FILE"

BACKUP_BASENAME="$(basename "$BACKUP_FILE" .enc)"
DECOMPRESSED_FILE="${BACKUP_DIR}/${BACKUP_BASENAME}"
# Remove .gz suffix to get the raw .db filename
DB_RESTORED="${DECOMPRESSED_FILE%.gz}"

# Step 1: Decrypt
log "  Decrypting..."
openssl enc -aes-256-cbc -d -salt -pbkdf2 -iter 100000 \
  -in "$BACKUP_FILE" \
  -out "$DECOMPRESSED_FILE" \
  -pass "pass:${ENCRYPTION_KEY}" \
  || fail "Decryption failed — wrong ENCRYPTION_KEY or corrupted backup"

# Step 2: Decompress
log "  Decompressing..."
gunzip -f "$DECOMPRESSED_FILE" || fail "Decompression failed"

# Step 3: Verify the restored DB is a valid SQLite database
log "  Verifying database integrity..."
if ! sqlite3 "$DB_RESTORED" "PRAGMA integrity_check;" 2>/dev/null | grep -q "ok"; then
  fail "Restored database failed integrity check"
fi

# Step 4: Stop any running server (best-effort)
log "  Stopping any running server..."
pkill -f "bun.*server/index.js" 2>/dev/null || true
pkill -f "bun run start:server" 2>/dev/null || true
pkill -f "bun run start" 2>/dev/null || true
sleep 1

# Step 5: Replace the live database
log "  Replacing database..."
# Back up current DB just in case
if [ -f "$DB_PATH" ]; then
  cp "$DB_PATH" "${DB_PATH}.pre-restore-$(date +%Y%m%d-%H%M%S).bak"
  log "    Current DB saved to ${DB_PATH}.pre-restore-*.bak"
fi

cp "$DB_RESTORED" "$DB_PATH"

# Step 6: Clean up WAL/SHM files (they belong to the old database)
rm -f "${DB_PATH}-wal" "${DB_PATH}-shm"

# Step 7: Verify the restored live DB opens and is internally consistent
log "  Verifying restored database..."
if ! sqlite3 "$DB_PATH" "PRAGMA integrity_check;" 2>/dev/null | grep -q "ok"; then
  fail "Restored live database failed integrity check"
fi

TABLE_COUNT="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table';" 2>/dev/null || true)"
if [ -z "$TABLE_COUNT" ] || [ "$TABLE_COUNT" -lt 1 ]; then
  fail "Restored live database failed readiness check"
fi

# Step 8: Clean up intermediate files
rm -f "$DB_RESTORED"

log "✅ Restore complete. Database has been replaced with: $(basename "$BACKUP_FILE")"
log "   You can restart the server now."
