#!/usr/bin/env node
/**
 * server-claude/index.ts
 *
 * Claude Code sidecar server (port 4600).
 * Handles ONLY Claude-specific functionality — OpenCode is never touched.
 *
 * Exposes:
 *   GET  /api/config                     → { claudeEnabled, claudeUrl, openCodeUrl }
 *   GET  /claude/sessions[?directory=]   → Claude session list
 *   POST /claude/session                 → create Claude session
 *   GET  /claude/session/:id             → session info
 *   GET  /claude/session/:id/message     → message history
 *   POST /claude/session/:id/prompt      → send prompt
 *   POST /claude/session/:id/abort       → abort session
 *   GET  /claude/event                   → SSE stream (Claude events only)
 *   POST /claude/permission/:id/reply    → approve/deny tool permission
 *
 * In dev mode: also spawns Vite at VITE_PORT (default 5173).
 * OpenCode continues to run on its own port, completely untouched.
 */

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import {
  listClaudeProjects,
  listClaudeSessions,
  findSessionMeta,
  readAllEntries,
  encodeProjectDir,
  addPendingSession,
  removePendingSession,
} from './storage.js';
import {
  ensureRunning,
  sendPrompt,
  abortSession,
  replyPermission,
  getSession,
  createSessionRecord,
  sessionEvents,
  getAllSessions,
} from './sessions.js';
import {
  sessionMetaToInfo,
  translateEvent,
  translateStoredEntries,
  ccSessionId,
  rawSessionId,
  CC_SESSION_PREFIX,
  CC_PERM_PREFIX,
} from './translator.js';
import type { ClaudeStreamEvent } from './types.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PROXY_PORT = Number(process.env.CLAUDE_PROXY_PORT ?? 4600);
const OPENCODE_URL = process.env.OPENCODE_URL ?? 'http://localhost:4096';
const CLAUDE_ENABLED = process.env.EXPERIMENTAL_CLAUDE === 'true';

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = join(ROOT_DIR, 'dist');
const IS_PROD = process.env.NODE_ENV === 'production';

const VITE_PORT = Number(process.env.VITE_PORT ?? 5173);

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = new Hono();
app.use('*', cors({ origin: '*' }));

if (!CLAUDE_ENABLED) {
  app.use('/claude/*', async (c) => c.json({ error: 'Claude support is disabled' }, 404));
}

// ---------------------------------------------------------------------------
// SSE fan-out — Claude events only
// ---------------------------------------------------------------------------

const sseClients = new Set<(data: string) => void>();

function broadcastSse(data: string) {
  for (const write of sseClients) {
    try {
      write(data);
    } catch {
      sseClients.delete(write);
    }
  }
}

sessionEvents.on('event', (sessionId: string, event: ClaudeStreamEvent) => {
  const session = getSession(sessionId);
  if (!session) return;
  const envelopes = translateEvent(event, sessionId, session.directory);
  for (const env of envelopes) {
    broadcastSse('data: ' + JSON.stringify(env) + '\n\n');
  }
});

sessionEvents.on('status', (sessionId: string, status: string) => {
  const session = getSession(sessionId);
  if (!session) return;
  const env = {
    directory: session.directory,
    payload: {
      type: 'session.status',
      properties: { sessionID: ccSessionId(sessionId), status: { type: status } },
    },
  };
  broadcastSse('data: ' + JSON.stringify(env) + '\n\n');
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/config
 * Fetched by the Vue app on startup to detect Claude support.
 */
app.get('/api/config', (c) => {
  return c.json({
    openCodeUrl: OPENCODE_URL,
    claudeEnabled: CLAUDE_ENABLED,
    claudeUrl: CLAUDE_ENABLED ? `http://localhost:${PROXY_PORT}` : null,
  });
});

/**
 * GET /claude/sessions[?directory=]
 */
app.get('/claude/sessions', async (c) => {
  const directory = c.req.query('directory');
  const sessions = await listClaudeSessions(directory);
  return c.json(sessions.map(sessionMetaToInfo));
});

/**
 * GET /claude/projects
 */
app.get('/claude/projects', async (c) => {
  const projects = await listClaudeProjects();
  return c.json(
    projects.map((p) => ({
      id: 'ccp_' + p.id,
      directory: p.directory,
      name: p.directory.split('/').pop() ?? p.directory,
      sessionCount: p.sessions.length,
    })),
  );
});

/**
 * POST /claude/session — create a new Claude session
 */
app.post('/claude/session', async (c) => {
  let body: Record<string, unknown> = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const directory = (body.directory as string) ?? process.cwd();
  const sessionId = crypto.randomUUID();
  createSessionRecord(sessionId, directory);
  await addPendingSession(sessionId, directory, 'New Claude session');

  const meta = {
    id: ccSessionId(sessionId),
    slug: sessionId.slice(0, 8),
    projectID: 'ccp_' + encodeProjectDir(directory),
    directory,
    title: 'New Claude session',
    version: '0',
    time: { created: Date.now(), updated: Date.now() },
  };

  return c.json({ sessionID: ccSessionId(sessionId), session: meta });
});

/**
 * GET /claude/session/:id
 */
app.get('/claude/session/:id', async (c) => {
  const id = c.req.param('id');
  const rawId = id.startsWith(CC_SESSION_PREFIX) ? rawSessionId(id) : id;
  const meta = await findSessionMeta(rawId);
  if (!meta) return c.json({ error: 'not found' }, 404);
  return c.json(sessionMetaToInfo(meta));
});

/**
 * GET /claude/session/:id/message
 */
app.get('/claude/session/:id/message', async (c) => {
  const id = c.req.param('id');
  const rawId = id.startsWith(CC_SESSION_PREFIX) ? rawSessionId(id) : id;
  const meta = await findSessionMeta(rawId);
  if (!meta) return c.json({ messages: [], parts: [] });

  const entries = await readAllEntries(meta.jsonlPath);
  const envelopes = translateStoredEntries(entries, rawId, meta.directory);

  const messages: unknown[] = [];
  const parts: unknown[] = [];
  for (const env of envelopes) {
    const type = env.payload.type;
    const props = env.payload.properties;
    if (type === 'message.updated') messages.push((props as { info: unknown }).info);
    else if (type === 'message.part.updated') parts.push((props as { part: unknown }).part);
  }

  return c.json({ messages, parts });
});

/**
 * POST /claude/session/:id/prompt
 */
app.post('/claude/session/:id/prompt', async (c) => {
  const id = c.req.param('id');
  const rawId = id.startsWith(CC_SESSION_PREFIX) ? rawSessionId(id) : id;

  let body: Record<string, unknown> = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const text = (body.text ?? body.content ?? body.prompt ?? '') as string;
  const meta = await findSessionMeta(rawId);
  const directory = meta?.directory ?? getSession(rawId)?.directory ?? process.cwd();
  const isResume = meta != null;

  const session = await ensureRunning(rawId, directory, isResume);
  sendPrompt(session, text);
  void removePendingSession(rawId); // Claude will now write to disk on its own

  return c.json({ ok: true });
});

/**
 * POST /claude/session/:id/abort
 */
app.post('/claude/session/:id/abort', async (c) => {
  const id = c.req.param('id');
  const rawId = id.startsWith(CC_SESSION_PREFIX) ? rawSessionId(id) : id;
  abortSession(rawId);
  return c.json({ ok: true });
});

/**
 * GET /claude/event — SSE stream for Claude events
 */
app.get('/claude/event', (c) => {
  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      data: JSON.stringify({ directory: '', payload: { type: 'connection.open', properties: {} } }),
    });

    const write = (data: string) => {
      stream.write(data).catch(() => sseClients.delete(write));
    };
    sseClients.add(write);

    const ping = setInterval(() => {
      stream.write(': ping\n\n').catch(() => {
        clearInterval(ping);
        sseClients.delete(write);
      });
    }, 15_000);

    await new Promise<void>((resolve) => {
      c.req.raw.signal?.addEventListener('abort', () => {
        clearInterval(ping);
        sseClients.delete(write);
        resolve();
      });
    });
  });
});

/**
 * POST /claude/permission/:id/reply
 */
app.post('/claude/permission/:id/reply', async (c) => {
  const permId = c.req.param('id');
  const requestId = permId.startsWith(CC_PERM_PREFIX)
    ? permId.slice(CC_PERM_PREFIX.length)
    : permId;

  let body: Record<string, unknown> = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const reply = body.reply as string;
  const behavior: 'allow' | 'deny' = reply === 'reject' ? 'deny' : 'allow';

  const sessions = getAllSessions();
  const ownerSession = sessions.find((s) => s.pendingPermissions.has(requestId));
  if (!ownerSession) return c.json({ error: 'Permission request not found' }, 404);

  replyPermission(ownerSession, requestId, behavior);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// UI serving (dev: proxy to Vite, prod: serve dist/)
// ---------------------------------------------------------------------------

if (IS_PROD) {
  app.use('*', serveStatic({ root: DIST_DIR }));
  app.get('*', async (c) => {
    return c.html(
      await import('node:fs/promises').then((fs) =>
        fs.readFile(join(DIST_DIR, 'index.html'), 'utf8'),
      ),
    );
  });
} else {
  app.all('*', async (c) => {
    const url = new URL(c.req.url);
    url.host = `localhost:${VITE_PORT}`;
    url.protocol = 'http:';
    try {
      const headers = new Headers(c.req.raw.headers);
      headers.delete('host');
      const res = await fetch(url.toString(), {
        method: c.req.method,
        headers,
        body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
        // @ts-expect-error node fetch duplex
        duplex: 'half',
      });
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries(res.headers.entries()),
      });
    } catch {
      return new Response('Vite dev server not ready yet', { status: 502 });
    }
  });
}

// ---------------------------------------------------------------------------
// Dev: spawn Vite
// ---------------------------------------------------------------------------

function startVite() {
  console.log('[dev:full] Starting Vite dev server...');
  const vite = spawn('npx', ['vite', 'dev', '--port', String(VITE_PORT)], {
    cwd: ROOT_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CLAUDE_PROXY_PORT: String(PROXY_PORT) },
  });

  vite.stdout?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line) console.log(`[vite] ${line}`);
  });
  vite.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line) {
      if (line.includes('already in use')) {
        console.warn(
          `[vite] Port ${VITE_PORT} already in use.\n` +
            `       Stop 'yarn dev' first — yarn dev:full starts Vite itself.\n` +
            `       Or: VITE_PORT=5174 yarn dev:full`,
        );
      } else {
        console.error(`[vite] ${line}`);
      }
    }
  });
  vite.on('exit', (code) => {
    if (code !== 0) console.error(`[vite] exited with code ${code}`);
  });
  process.on('exit', () => vite.kill());
  process.on('SIGINT', () => {
    vite.kill();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    vite.kill();
    process.exit(0);
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

if (!IS_PROD) startVite();

serve({ fetch: app.fetch, port: PROXY_PORT }, (info) => {
  console.log(`\n[dev:full] Claude sidecar ready at http://localhost:${info.port}`);
  console.log(`[dev:full] OpenCode at ${OPENCODE_URL} (untouched)`);
  if (!IS_PROD) console.log(`[dev:full] Vite UI at http://localhost:${VITE_PORT}`);
  console.log();
});
