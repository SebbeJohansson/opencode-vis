/**
 * storage.ts
 * Reads ~/.claude/projects/ from disk to enumerate Claude Code projects and sessions.
 * Sessions are stored as JSONL files: one file per session, one entry per message.
 */

import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { StoredEntry, StoredUserEntry, StoredSummaryEntry } from './types';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export const CLAUDE_DIR = join(homedir(), '.claude');
export const PROJECTS_DIR = join(CLAUDE_DIR, 'projects');

// Persisted store for sessions created via the UI but not yet written to disk by Claude
const PENDING_SESSIONS_PATH = join(homedir(), '.config', 'openui', 'pending-claude-sessions.json');

type PendingSessionRecord = {
  id: string;
  directory: string;
  title: string;
  timeCreated: number;
};

async function readPendingSessions(): Promise<PendingSessionRecord[]> {
  try {
    const raw = await readFile(PENDING_SESSIONS_PATH, 'utf8');
    return JSON.parse(raw) as PendingSessionRecord[];
  } catch {
    return [];
  }
}

async function writePendingSessions(sessions: PendingSessionRecord[]): Promise<void> {
  await mkdir(join(homedir(), '.config', 'openui'), { recursive: true });
  await writeFile(PENDING_SESSIONS_PATH, JSON.stringify(sessions, null, 2));
}

export async function addPendingSession(
  id: string,
  directory: string,
  title: string,
): Promise<void> {
  const existing = await readPendingSessions();
  if (existing.find((s) => s.id === id)) return;
  await writePendingSessions([...existing, { id, directory, title, timeCreated: Date.now() }]);
}

export async function removePendingSession(id: string): Promise<void> {
  const existing = await readPendingSessions();
  await writePendingSessions(existing.filter((s) => s.id !== id));
}

/** Decode ~/.claude/projects/-home-user-projects-foo → /home/user/projects/foo */
export function decodeProjectDir(encoded: string): string {
  return encoded.replace(/-/g, '/').replace(/^\//, '');
}

/** Encode /home/user/projects/foo → -home-user-projects-foo */
export function encodeProjectDir(directory: string): string {
  return directory.replace(/\//g, '-');
}

// ---------------------------------------------------------------------------
// Session metadata (lightweight — read only first ~30 lines of JSONL)
// ---------------------------------------------------------------------------

export type ClaudeSessionMeta = {
  id: string;
  jsonlPath: string;
  directory: string;
  projectID: string;
  title: string;
  gitBranch?: string;
  timeCreated: number;
  timeUpdated: number;
};

function extractTitle(entries: StoredEntry[]): string {
  // Prefer an explicit summary entry
  const summary = entries.find((e): e is StoredSummaryEntry => e.type === 'summary');
  if (summary?.summary) return summary.summary.slice(0, 80);

  // Fall back to first user message text
  const firstUser = entries.find((e): e is StoredUserEntry => e.type === 'user');
  if (firstUser) {
    const content = firstUser.message?.content;
    if (typeof content === 'string') return content.slice(0, 80);
    if (Array.isArray(content)) {
      const textBlock = content.find((c) => c.type === 'text' && c.text);
      if (textBlock?.text) {
        // Strip IDE selection/file wrappers
        const clean = textBlock.text
          .replace(/<ide_selection>[\s\S]*?<\/ide_selection>/g, '')
          .replace(/<ide_opened_file>[\s\S]*?<\/ide_opened_file>/g, '')
          .replace(/<[^>]+>/g, '')
          .trim();
        if (clean) return clean.slice(0, 80);
      }
    }
  }

  return 'Untitled session';
}

export async function readSessionMeta(
  jsonlPath: string,
  _directoryHint: string,
  projectID: string,
): Promise<ClaudeSessionMeta | null> {
  try {
    // Read up to 30 lines — enough to find cwd, sessionId, and timestamp
    const raw = await readFile(jsonlPath, 'utf8');
    const allLines = raw.split('\n').filter((l) => l.trim());
    if (allLines.length === 0) return null;

    const headEntries = allLines
      .slice(0, 30)
      .map((l) => {
        try {
          return JSON.parse(l) as StoredEntry;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as StoredEntry[];

    const tailEntry =
      allLines.length > 1
        ? (() => {
            try {
              return JSON.parse(allLines.at(-1) ?? '') as StoredEntry;
            } catch {
              return null;
            }
          })()
        : null;

    // Find the first entry that has a cwd (skip queue-operation etc.)
    const firstWithCwd = headEntries.find((e) => typeof (e as StoredUserEntry).cwd === 'string') as
      | StoredUserEntry
      | undefined;

    const directory = firstWithCwd?.cwd ?? _directoryHint;
    const sessionId =
      firstWithCwd?.sessionId ?? jsonlPath.replace(/.*\//, '').replace('.jsonl', '');
    const gitBranch = firstWithCwd?.gitBranch;

    const firstTimestamp = headEntries.find(
      (e) => typeof (e as StoredUserEntry).timestamp === 'string',
    ) as StoredUserEntry | undefined;
    const lastTimestamp = tailEntry as StoredUserEntry | null;

    const created = new Date(firstTimestamp?.timestamp ?? 0).getTime();
    const updated = new Date(lastTimestamp?.timestamp ?? firstTimestamp?.timestamp ?? 0).getTime();

    const title = extractTitle(headEntries.slice(0, 20));

    return {
      id: sessionId,
      directory,
      projectID,
      title,
      gitBranch,
      timeCreated: created || Date.now(),
      timeUpdated: updated || Date.now(),
      jsonlPath,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Project + session enumeration
// ---------------------------------------------------------------------------

export interface ClaudeProject {
  id: string; // encoded dir name used as stable ID
  directory: string; // absolute path
  sessions: ClaudeSessionMeta[];
}

export async function listClaudeProjects(): Promise<ClaudeProject[]> {
  let projectDirs: string[];
  try {
    projectDirs = await readdir(PROJECTS_DIR);
  } catch {
    return [];
  }

  // Collect all sessions first — the encoded dir name is not reliably decodable,
  // so we group by the cwd read from each JSONL file.
  const sessionsByDir = new Map<string, ClaudeSessionMeta[]>();
  const projectIdByDir = new Map<string, string>(); // dir → encoded folder name

  for (const dirName of projectDirs) {
    const projectPath = join(PROJECTS_DIR, dirName);
    const statResult = await stat(projectPath).catch(() => null);
    if (!statResult?.isDirectory()) continue;

    const directoryHint = '/' + decodeProjectDir(dirName);

    let files: string[];
    try {
      files = await readdir(projectPath);
    } catch {
      continue;
    }

    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));

    for (const file of jsonlFiles) {
      const jsonlPath = join(projectPath, file);
      const meta = await readSessionMeta(jsonlPath, directoryHint, dirName);
      if (!meta) continue;

      const dir = meta.directory;
      if (!sessionsByDir.has(dir)) sessionsByDir.set(dir, []);
      sessionsByDir.get(dir)!.push(meta);

      // Use the encoded folder name as project ID, keyed by resolved directory
      if (!projectIdByDir.has(dir)) projectIdByDir.set(dir, dirName);
    }
  }

  const projects: ClaudeProject[] = [];

  for (const [directory, sessions] of sessionsByDir) {
    sessions.sort((a, b) => b.timeUpdated - a.timeUpdated);
    projects.push({
      id: projectIdByDir.get(directory) ?? encodeProjectDir(directory),
      directory,
      sessions,
    });
  }

  // Sort projects by most recent activity
  projects.sort((a, b) => {
    const aTime = a.sessions[0]?.timeUpdated ?? 0;
    const bTime = b.sessions[0]?.timeUpdated ?? 0;
    return bTime - aTime;
  });

  return projects;
}

export async function listClaudeSessions(directory?: string): Promise<ClaudeSessionMeta[]> {
  const projects = await listClaudeProjects();
  const diskSessions = directory
    ? (projects.find((p) => p.directory === directory)?.sessions ?? [])
    : projects.flatMap((p) => p.sessions);

  // Also include sessions created via the UI that haven't been written to disk yet
  const pending = await readPendingSessions();
  const diskIds = new Set(diskSessions.map((s) => s.id));

  const pendingSessions: ClaudeSessionMeta[] = pending
    .filter((p) => !diskIds.has(p.id) && (!directory || p.directory === directory))
    .map((p) => ({
      id: p.id,
      jsonlPath: '',
      directory: p.directory,
      projectID: encodeProjectDir(p.directory),
      title: p.title,
      timeCreated: p.timeCreated,
      timeUpdated: p.timeCreated,
    }));

  return [...diskSessions, ...pendingSessions];
}

export async function findSessionMeta(sessionId: string): Promise<ClaudeSessionMeta | null> {
  const sessions = await listClaudeSessions();
  return sessions.find((s) => s.id === sessionId) ?? null;
}

// ---------------------------------------------------------------------------
// Full JSONL reader (for replaying history)
// ---------------------------------------------------------------------------

export async function readAllEntries(jsonlPath: string): Promise<StoredEntry[]> {
  const raw = await readFile(jsonlPath, 'utf8').catch(() => '');
  return raw
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l) as StoredEntry;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as StoredEntry[];
}
