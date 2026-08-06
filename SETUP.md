# Setup Guide

## Prerequisites

- **Bun** ≥ 1.x ([install](https://bun.sh))
- **Node.js** ≥ 20 (for compatibility with some tooling)
- **Git**

## Clone & Install

```bash
git clone https://github.com/glitterqueen22/ShimmerStock.git
cd ShimmerStock
bun install
```

## Environment Configuration

Create a `.env` file from the example (or copy the template below):

```bash
cp .env.example .env
```

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `SHOPIFY_CLIENT_ID` | Shopify OAuth client ID |
| `SHOPIFY_CLIENT_SECRET` | Shopify OAuth client secret |
| `SHOPIFY_STORE_DOMAIN` | Default Shopify store domain (e.g., `mystore.myshopify.com`) |
| `SHOPIFY_API_TOKEN` | Shopify Admin API access token (for backward compat) |
| `SHOPIFY_READ_ONLY` | Set to `true` to prevent write operations to Shopify |
| `ENCRYPTION_KEY` | 64-char hex string for encrypting sensitive data at rest |
| `OWNER_INITIAL_PASSWORD` | Required on a fresh database to seed the initial owner account |
| `ADMIN_INITIAL_PASSWORD` | Required on a fresh database to seed the initial admin account |

### Optional Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: `3000`) |
| `NODE_ENV` | Environment (`development`, `production`) |
| `SHIMMERSTOCK_URL` | Public base URL; required for staging/private mode and production |
| `SHIMMERSTOCK_DB_PATH` | Override the SQLite database path (recommended for private staging volumes) |
| `SHIMMERSTOCK_BACKUP_DIR` | Override backup archive/log directory (recommended for private staging volumes) |
| `SHIMMERSTOCK_PRIVATE_MODE` | Set to `true` to disable public self-service registration |
| `SESSION_COOKIE_SAME_SITE` | Cookie SameSite mode (`lax`, `strict`, `none`) |
| `SESSION_COOKIE_SECURE` | Force secure session cookies outside production/private mode |
| `CORS_ALLOWED_ORIGIN` | Optional explicit cross-origin origin for trusted non-browser clients or local split-origin development |

### Example `.env`

```env
SHOPIFY_READ_ONLY=true
SHOPIFY_CLIENT_ID=your_client_id
SHOPIFY_CLIENT_SECRET=your_client_secret
SHOPIFY_STORE_DOMAIN=yourstore.myshopify.com
ENCRYPTION_KEY=your_64_char_hex_encryption_key
SHIMMERSTOCK_URL=http://localhost:3000
SHOPIFY_API_TOKEN=your_api_token
OWNER_INITIAL_PASSWORD=replace-with-strong-owner-password
ADMIN_INITIAL_PASSWORD=replace-with-strong-admin-password
```

## Database Initialization

The database is created automatically on first server start:

```bash
bun run dev
```

This creates `shimmerstock.db` in the project root with WAL journal mode enabled. For private staging, set `SHIMMERSTOCK_DB_PATH` to a persistent mounted volume path and set `SHIMMERSTOCK_BACKUP_DIR` to a persistent backups directory on the same volume.

### Seed Demo Data

```bash
# Seed initial data (admin user, demo business)
bun run seed

# Reset and re-seed
bun run seed:reset
```

Default admin login: `admin` / `[REDACTED — change immediately]`

## Development

```bash
# Start development server (port 3000)
bun run dev

# The React frontend is served from client/dist after build
# Run a Vite dev server separately for hot reload:
cd client && npx vite --port 5173
```

### Development Workflow

1. Backend changes in `server/` take effect on restart (use `--watch` with bun or nodemon)
2. Frontend changes in `client/` are reflected immediately with Vite HMR
3. Run tests: `bun test` (when available)
4. Lint: configure ESLint/Prettier as needed

## Build for Production

```bash
# Build frontend
bun run build

# Start production server after a build
bun run start:server
```

The production server serves the built React app from `client/dist/` and the API from the same Express process. In staging/private mode or production mode, `SHIMMERSTOCK_URL` must be set to an `https://` URL.

## Directory Structure After Setup

```
.
├── .env                  # Your environment config (gitignored)
├── shimmerstock.db       # SQLite database (gitignored)
├── client/dist/          # Built frontend (gitignored)
├── node_modules/         # Dependencies (gitignored)
└── ...
```

## Troubleshooting

**Port 3000 already in use:**
```bash
sudo lsof -t -iTCP:3000 -sTCP:LISTEN | xargs -r kill
```

**Database locked:**
SQLite WAL mode can leave `-wal` and `-shm` files. Delete them if the database seems corrupted:
```bash
rm shimmerstock.db-wal shimmerstock.db-shm
```

**Module not found:**
Ensure `bun install` completed. Check that all dependencies in `package.json` are installed.
