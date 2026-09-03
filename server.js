#!/usr/bin/env node
import { serveStatic } from '@hono/node-server/serve-static';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { join } from 'node:path';
import { proxy } from 'hono/proxy';

const VIS_PORT = Number(process.env.VIS_PORT ?? 3000);
// If set, the UI will auto-configure to point at this URL instead of asking
// the user to enter one manually. e.g. OPENCODE_URL=http://localhost:4096
const OPENCODE_URL = process.env.OPENCODE_URL ?? null;

const app = new Hono();

if (process.argv[2] === 'proxy') {
  const baseURL = process.argv[3] ?? 'https://sebbejohansson.github.io/openui/';

  console.log('Proxy to ' + baseURL);

  app.use('*', (c) => {
    const url = new URL(baseURL);
    url.pathname = url.pathname.replace(/\/$/, '') + c.req.path;

    const q = c.req.queries();
    for (const k in q) {
      for (const v of q?.[k] ?? []) {
        url.searchParams.append(k, v);
      }
    }

    return proxy(url, {
      ...c.req,
    });
  });
} else {
  // Serve runtime config so the Vue app can auto-configure on startup.
  // Returns null for openCodeUrl if OPENCODE_URL is not set — the app will
  // fall back to the manual login screen in that case.
  app.get('/api/config', (c) => {
    return c.json({
      openCodeUrl: OPENCODE_URL,
      claudeEnabled: false,
      upstreamUrl: OPENCODE_URL,
    });
  });

  app.use('*', serveStatic({ root: join(import.meta.dirname, 'dist/') }));
}

serve(
  {
    fetch: app.fetch,
    port: VIS_PORT,
  },
  (info) => {
    console.log(`Listening on http://localhost:${info.port}`);
    if (OPENCODE_URL) {
      console.log(`Auto-configuring UI to connect to OpenCode at ${OPENCODE_URL}`);
    } else {
      console.log(`No OPENCODE_URL set — users will configure the server URL manually in the UI`);
      console.log(`  To auto-configure: OPENCODE_URL=http://localhost:4096 npx openui`);
    }
  },
);
