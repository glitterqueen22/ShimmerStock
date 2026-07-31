# Deployment

## Overview

ShimmerStock is a single-process Bun/Express application that serves both the API and the React frontend. Deployment is straightforward: build the frontend, start the server.

## Build Steps

```bash
# Install dependencies
bun install

# Build the React frontend
bun run build

# Start the server
bun run start
```

The `bun run start` command runs `bun run build && bun run server/index.js`, which:
1. Builds the React app to `client/dist/`
2. Starts Express on port 3000, serving both API routes and the static frontend

## Production Environment

### Required Environment Variables

All variables from [SETUP.md](SETUP.md) must be set in production, plus:

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | Set to `production` |
| `PORT` | Server port (default: `3000`) |
| `SHIMMERSTOCK_URL` | Public URL of the deployment (for webhooks, OAuth callbacks) |

### Process Management

Use a process manager to keep the server running:

**systemd (recommended):**

```ini
# /etc/systemd/system/shimmerstock.service
[Unit]
Description=ShimmerStock
After=network.target

[Service]
Type=simple
User=shimmerstock
WorkingDirectory=/opt/shimmerstock
ExecStart=/usr/local/bin/bun run server/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=/opt/shimmerstock/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now shimmerstock
```

**PM2:**

```bash
pm2 start server/index.js --name shimmerstock --interpreter bun
pm2 save
pm2 startup
```

### Reverse Proxy

Run behind Nginx or Caddy for SSL termination:

**Nginx:**

```nginx
server {
    listen 443 ssl;
    server_name shimmerstock.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Caddy:**

```
shimmerstock.example.com {
    reverse_proxy localhost:3000
}
```

## Health Check

The server exposes a health endpoint:

```
GET /api/health
→ { "status": "ok", "uptime": 12345 }
```

Use this for monitoring and load balancer health checks.

## Shopify Webhooks

Ensure `SHIMMERSTOCK_URL` is set to the public URL. Shopify webhooks are registered at:

```
POST /api/shopify/webhooks/<topic>
```

The Shopify OAuth flow will register webhooks automatically for connected stores.

## Logging

Server logs go to stdout/stderr by default. Redirect to a file with your process manager:

```bash
# systemd: logs go to journald
journalctl -u shimmerstock -f

# PM2:
pm2 logs shimmerstock
```

## Security Checklist

- [ ] Rotate all default credentials and API tokens
- [ ] Use a strong, random `ENCRYPTION_KEY`
- [ ] Set `SHOPIFY_READ_ONLY=true` as a safety net initially
- [ ] Ensure `.env` is not committed to the repository
- [ ] Run behind HTTPS (reverse proxy with SSL)
- [ ] Set up firewall rules (only expose ports 80/443, not 3000 directly)
- [ ] Configure automated database backups (see [BACKUP.md](BACKUP.md))
- [ ] Set up monitoring and alerting (see P0.7 in business plan)

## Resource Requirements

- **Memory**: ~256MB minimum, 512MB recommended
- **Disk**: 1GB minimum for application + database growth
- **CPU**: 1 vCPU sufficient for moderate load

SQLite performs well up to moderate concurrency. For high-traffic deployments, migrate to PostgreSQL.
