## Context

The file tree feature (`useFileTree.ts`, `TreeView.vue`) works on Unix but silently breaks on Windows. The root cause is that all path utilities assume `/` as the separator and paths starting with `/`. On Windows, OpenCode serves paths like `C:\Users\foo\project` and file watcher events carry similar backslash paths.

The affected logic includes:
- `normalizeDirectory` — only trims trailing `/`, doesn't handle `\` or drive letters
- `toRelativePath` — computes `prefix = "${dir}/"` then calls `startsWith(prefix)`, which fails when dir uses `\`
- `isPathInsideDirectory` — same issue; file watcher events get silently dropped
- `normalizeRelativePath` — removes leading `./`, `../`, `/` but not `.\`, `..\`, `\`
- `treeDirectoryName` in `App.vue` — splits on `/` only, returns empty for `C:\Users\foo\project`
- `replaceHomePrefix` in `App.vue` — bails early with `!normalizedPath.startsWith('/')`, returns raw Windows path without crash but `~` shortening never applies
- `resolveWorktreeRelativePath` — same early bail

## Goals / Non-Goals

**Goals:**
- File tree populates correctly when OpenCode runs on Windows
- File watcher events are processed correctly on Windows (tree reflects changes in real time)
- Branch info and git status display correctly on Windows
- Directory name display is correct in the tree header
- No regression for Unix/Mac users

**Non-Goals:**
- Fixing the PTY/bash layer for Windows — `usePtyOneshot` spawns `bash` which requires Git Bash or WSL to be available; this is out of scope for this change and tracked separately
- Handling UNC paths (`\\server\share\...`)
- Normalizing paths in the OpenCode server itself

## Decisions

### Decision 1: Normalize paths to forward slashes at ingestion boundaries, not at usage sites

**Chosen approach**: Add a single `toForwardSlashes(path: string): string` utility that replaces all `\` with `/`, then apply it at the earliest possible point where a path enters from the outside world (from the server or file watcher). All internal code continues to assume forward slashes.

**Alternative considered**: Patch every individual comparison to be slash-agnostic (e.g., normalize both sides inline at each call site). Rejected because it's easy to miss call sites and harder to test.

**Why this approach**: Single responsibility — normalize once, use everywhere. Already how the existing `normalizeRelativePath` tries to work; we're extending the same philosophy.

### Decision 2: Keep Windows drive letters (don't convert to POSIX-style `/c/...`)

**Chosen approach**: `C:\Users\foo` → `C:/Users/foo` (drive letter preserved).

**Alternative considered**: Convert to POSIX git-bash style `/c/Users/foo`. Rejected because the OpenCode API itself uses Windows paths with drive letters as query parameters, and we don't control the server.

**Why this approach**: Minimal transformation — only change separators, keep the rest identical to what the server sends.

### Decision 3: `replaceHomePrefix` and `resolveWorktreeRelativePath` — graceful no-op for Windows paths

The `startsWith('/')` guard in `replaceHomePrefix` was added to avoid matching Windows paths against a Unix `~` prefix. The correct fix is: after normalizing to forward slashes, check whether the path starts with a drive letter pattern (`/^[A-Za-z]:\//`). If so, skip the `~` substitution entirely rather than returning the raw backslash path.

## Risks / Trade-offs

- **Risk**: Some file paths from the API may already use forward slashes on Windows (e.g., paths returned by git commands via the OpenCode API). Double-normalizing is harmless since `replace(/\\/g, '/')` is idempotent.
- **Risk**: If OpenCode ever sends UNC paths (`\\server\share`), they will be normalized to `//server/share` which may cause unexpected behavior. → Mitigation: Document as known limitation; add a comment in code.
- **Trade-off**: Not fixing the PTY/bash layer means git status, branch listing, and diff stats still won't work on Windows without Git Bash or WSL. The tree will at least populate from the `/file` API and show the correct structure, but status badges may be absent.

## Migration Plan

No API changes, no data migration. This is a pure client-side fix. Deploy by releasing a new version of the UI.

## Open Questions

- Does the OpenCode `/file` API endpoint return backslash paths in its response JSON on Windows, or does it normalize to forward slashes internally? This affects whether `normalizeFileNode` in `useFileTree.ts` also needs to apply `toForwardSlashes` to the path fields it reads from API responses.
- Does `file.watcher.updated` send backslash paths on Windows? (Almost certainly yes, since it's likely emitted from Node.js `chokidar` which uses `path.join` — OS-dependent.)
