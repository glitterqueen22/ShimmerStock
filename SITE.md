# Your site

This is the team's website. It's a [TanStack Start](https://tanstack.com/start)
app (React + Vite + Tailwind), served on **port 3000**. It starts life as a simple
"coming soon" placeholder (the headline reads the business name from `site.json` at
request time), but it's a real full-stack framework — build it out into the real
site and grow it into a dynamic app without changing hosting or starting a second
server.

## Layout

```
src/
  routes/
    __root.tsx     # the HTML shell: <head>, fonts, global layout
    index.tsx      # the landing page ("/")
  styles/app.css   # Tailwind entrypoint + base styles
vite.config.ts     # serves on 0.0.0.0:3000
```

Add a page by creating a new file under `src/routes/` — e.g. `about.tsx` becomes
`/about`. Files are routes; the router is generated automatically.

## Publishing changes

After editing, run:

```bash
bun run publish
```

This rebuilds the site and restarts the server on port 3000. (Editing files alone
does not update the live site — you must publish.) It always takes over port 3000
from whatever is running there, so it's safe to re-run no matter who started the
current server. The server log is `.run/server.log`.

## Staging runtime

This repository's current application runtime is the Bun and Express server started by:

```bash
bun run start:server
```

For private staging, follow [DEPLOYMENT.md](DEPLOYMENT.md). Do not use Vercel or `serve.ts` for the current ShimmerStock application runtime.

## Making it dynamic

The site is static today, but adding backend behavior is one file away — no second
process, no extra port, all served on the same port 3000:

- **Server function** — call server-only code (DB, secrets, fetch) directly from a
  component:

  ```tsx
  import { createServerFn } from "@tanstack/react-start";

  const getMessage = createServerFn().handler(async () => {
    return { message: "Hello from the server" };
  });
  ```

- **API route** — add `src/routes/api/<name>.ts` for a REST endpoint.

Run `bun run publish` after either, and the dynamic behavior is live.

## Adding a database

When the site needs to store data (form submissions, content, accounts), connect a
database rather than writing to files:

1. Call `discover_tools` for a database (e.g. "serverless Postgres with a free
   tier"). The owner connects it (Neon) from the card, which provides `DATABASE_URL`.
2. Query it from server-only code with the built-in helper — never from the client:

   ```tsx
   import { createServerFn } from "@tanstack/react-start";
   import { sql } from "~/db";

   const getPosts = createServerFn().handler(async () => {
     const rows = await sql()`select id, title, created_at from posts`;
     // Coerce non-primitive columns before returning — timestamps come back as JS
     // Dates, which React will not render:
     return rows.map((r) => ({ ...r, created_at: String(r.created_at) }));
   });
   ```

`DATABASE_URL` is injected into this sandbox automatically once connected, and it's
passed to the live host by `bun run go-live` — so the same code works in the preview
and in production. If you connect the database _after_ going live, re-run
`bun run go-live` so production picks up `DATABASE_URL`. One database serves both the
preview and the live site.
