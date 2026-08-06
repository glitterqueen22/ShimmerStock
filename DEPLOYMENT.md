# Deployment

## Current architecture

ShimmerStock is currently a single-process Bun and Express application that serves both the API and the built React frontend from one long-running web process. For the P1 internal pilot, staging must remain:

- one persistent web service
- one persistent volume for SQLite and backups
- manual deploy only from reviewed `main`
- private environment variables injected by the host
- HTTPS terminated by the platform
- no Vercel
- no Shopify connection for GGE
- no Shopify write mode

`serve.ts` is not the ShimmerStock staging runtime and should not be used for this application deployment path.

## Build and start

```bash
bun install --frozen-lockfile
bun run build
bun run start:server
```

`bun run start:server` is the long-running process command for staging and production-style hosts.

## Required staging environment variables

| Variable | Purpose |
|----------|---------|
| `ENCRYPTION_KEY` | Required 64-char hex key for encrypted secrets at rest |
| `OWNER_INITIAL_PASSWORD` | Required only when seeding a fresh staging database |
| `ADMIN_INITIAL_PASSWORD` | Required only when seeding a fresh staging database |
| `SHIMMERSTOCK_URL` | Required `https://` public staging URL |
| `SHIMMERSTOCK_DB_PATH` | SQLite path on the persistent mounted volume |
| `SHIMMERSTOCK_BACKUP_DIR` | Backup archive directory on the same persistent volume as SQLite |
| `SHIMMERSTOCK_PRIVATE_MODE` | Set to `true` for invite-only/private staging |
| `PORT` | Host-injected port for the web process |
| `RAILPACK_DEPLOY_APT_PACKAGES` | Must be `sqlite3 gzip openssl` so backup/restore tools are available at runtime |
| `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | Must be `30` so graceful shutdown cleanup can complete on SIGTERM |

## Optional staging environment variables

| Variable | Purpose |
|----------|---------|
| `NODE_ENV` | Set to `production` on the staging host |
| `SESSION_COOKIE_SAME_SITE` | Override default cookie same-site mode (`lax`) |
| `SESSION_COOKIE_SECURE` | Force secure cookies outside production/private mode |
| `CORS_ALLOWED_ORIGIN` | Leave unset by default; set only for an explicitly approved cross-origin client |
| `SHOPIFY_READ_ONLY` | Extra safety net; keep `true` |
| `SHOPIFY_ALLOW_WRITE_MODE` | Must remain unset or `false` |
| `SHOPIFY_SYNC_MODE` | Leave unset unless a future approved milestone requires it |
| `SHOPIFY_CLIENT_ID` | Leave configured only if a future approved milestone requires Shopify OAuth |
| `SHOPIFY_CLIENT_SECRET` | Leave configured only if a future approved milestone requires Shopify OAuth |
| `SHOPIFY_STORE_DOMAIN` | Leave unset unless explicitly needed for an approved test |
| `SHOPIFY_API_TOKEN` | Leave unset unless explicitly needed for an approved read-only test |
| `PUBLIC_URL` | Optional marketing/public URL override used by affiliate attribution links |

## Health and readiness

- Liveness: `GET /health`
- Readiness: `GET /ready`

Both return only a minimal status payload and expose no secrets or internal operational detail.

Cross-origin requests remain denied by default. Only set `CORS_ALLOWED_ORIGIN` when an explicitly approved client needs cross-origin access.

## Private staging behavior

- `SHIMMERSTOCK_PRIVATE_MODE=true` disables `POST /api/auth/register`
- `SHIMMERSTOCK_PRIVATE_MODE=true` blocks unauthenticated public submission writes:
  - `POST /api/dream-grant/apply`
  - `POST /api/waitlist/join`
  - `POST /api/partner/forms/:formId/submissions`
  - `POST /api/affiliate-attribution/track-click`
- authenticated application flows continue to work
- access is limited to seeded bootstrap accounts plus users created or invited by authenticated owners/admins

## SQLite staging layout

Recommended volume layout on the host:

```text
/data/
  shimmerstock.db
  backups/
```

Startup migrations are idempotent and run at boot through `initDb()`.

PostgreSQL remains mandatory before onboarding unrelated external paying businesses.

## Railway-ready service shape

Recommended single service shape:

- Source: GitHub repository `main`
- Builder: Nixpacks or Railpack
- Build command: `bun install --frozen-lockfile && bun run build`
- Start command: `bun run start:server`
- Health check path: `/ready`
- Instance count: 1
- Persistent volume: mounted path used by `SHIMMERSTOCK_DB_PATH`
- TLS: platform-managed
- Deploy policy: manual deploy only from reviewed `main`

Runtime behavior for Railway:

- the app listens on host-injected `PORT`
- the server binds `0.0.0.0` (all interfaces)
- no hardcoded port values

Do not enable automatic deploys from pull requests or unreviewed branches.

## Manual Railway settings to configure

1. Attach one persistent volume.
2. Set `SHIMMERSTOCK_DB_PATH` to `/data/shimmerstock.db`.
3. Set `SHIMMERSTOCK_BACKUP_DIR` to `/data/backups`.
4. Set `RAILPACK_DEPLOY_APT_PACKAGES=sqlite3 gzip openssl`.
5. Set `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=30`.
6. Inject the required environment variables listed above.
7. Set the health check path to `/ready`.
8. Use manual deploy from reviewed `main` only.
9. Keep `SHOPIFY_ALLOW_WRITE_MODE` disabled.
10. Keep GGE disconnected.

## Backup, restore, and rollback

Backup and restore use the existing encrypted SQLite scripts with:

- `SHIMMERSTOCK_DB_PATH=/data/shimmerstock.db`
- `SHIMMERSTOCK_BACKUP_DIR=/data/backups`

Rollback procedure:

1. Stop the staging process.
2. Restore the last known-good encrypted backup to the configured `SHIMMERSTOCK_DB_PATH`.
3. Restart with `bun run start:server`.
4. Verify `GET /ready` returns `200`.

## Obsolete deployment guidance to avoid

- Do not use Vercel for the current stateful Bun and Express plus SQLite application.
- Do not use `serve.ts` as the ShimmerStock app runtime.
- Do not auto-deploy pull requests.
- Do not provision paid infrastructure as part of code changes.
