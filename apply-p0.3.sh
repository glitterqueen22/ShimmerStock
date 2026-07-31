#!/bin/bash
set -e
cd /home/team/shared/site
echo "=== P0.3 Session Multi-Tenancy Fix ==="
echo ""

# 1. Run migration
echo "1. Running DB migration..."
bun run server/migrations/p0.3-session-tenancy.js
echo ""

# 2. Apply code patches
echo "2. Running code patches..."
bun run server/migrations/p0.3-apply-all.js
echo ""

echo "=== Done ==="
