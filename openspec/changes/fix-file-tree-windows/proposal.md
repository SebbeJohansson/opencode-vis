## Why

The file tree panel is broken when OpenCode runs on Windows because the entire path handling layer assumes Unix-style forward-slash paths. Windows paths use backslashes (`C:\Users\...`) and the file watcher, tree builder, and git status parser never account for this, causing the tree to silently fail to populate or update.

## What Changes

- Normalize all directory and file paths received from the OpenCode server to use forward slashes before they enter any path-comparison or tree-building logic
- Fix `normalizeDirectory` and `toRelativePath` in `useFileTree.ts` to strip/normalize backslashes and Windows drive prefixes (e.g. `C:\`)
- Fix `isPathInsideDirectory` to handle mixed slash styles so file watcher events are not silently dropped
- Fix `normalizeRelativePath` to handle backslash separators from git output on Windows
- Fix `treeDirectoryName` computed in `App.vue` to correctly extract the last segment from Windows paths (currently only splits on `/`)
- Fix `replaceHomePrefix` in `App.vue` to not bail out on paths that don't start with `/` (Windows absolute paths start with drive letters)
- Fix `resolveWorktreeRelativePath` in `App.vue` for the same reason
- Fix `ProjectPicker.vue` and `ProjectSettingsDialog.vue` path utilities for Windows paths

## Capabilities

### New Capabilities
- `windows-path-compatibility`: All path normalization and comparison utilities accept both Windows (`\`) and Unix (`/`) path formats and normalize to forward slashes internally

### Modified Capabilities
<!-- No existing specs have requirement-level changes -->

## Impact

- `app/composables/useFileTree.ts` — primary fix location: `normalizeDirectory`, `normalizeRelativePath`, `toRelativePath`, `isPathInsideDirectory`, `buildTreeNodes`, `parseGitFileList`, `feed`
- `app/composables/usePtyOneshot.ts` — PTY commands use `bash`; on Windows OpenCode uses a shell that may not be `bash`; the CWD passed as a Windows path may or may not be understood
- `app/App.vue` — `treeDirectoryName`, `replaceHomePrefix`, `resolveWorktreeRelativePath`, `normalizeDirectory` (local copy)
- `app/components/ProjectPicker.vue` — path display and navigation utilities
- `app/components/ProjectSettingsDialog.vue` — worktree path display
- No API or dependency changes required
