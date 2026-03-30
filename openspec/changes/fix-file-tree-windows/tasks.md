## 1. Path Normalization Utility

- [x] 1.1 Add `toForwardSlashes(path: string): string` utility function in `useFileTree.ts` that replaces all `\` with `/`
- [x] 1.2 Add `normalizeAbsolutePath(path: string): string` utility that calls `toForwardSlashes` and normalizes trailing slashes — to be used as the single entry-point for all paths coming from the server

## 2. Fix useFileTree Core Path Functions

- [x] 2.1 Update `normalizeDirectory` in `useFileTree.ts` to call `toForwardSlashes` before trimming trailing slashes
- [x] 2.2 Update `normalizeRelativePath` in `useFileTree.ts` to call `toForwardSlashes` so backslash-separated relative paths (e.g., from git output on Windows) are handled correctly
- [x] 2.3 Update `toRelativePath` in `useFileTree.ts` to normalize both `path` and `directory` via `toForwardSlashes` before comparison
- [x] 2.4 Update `isPathInsideDirectory` in `useFileTree.ts` to normalize both arguments via `toForwardSlashes` before comparison
- [x] 2.5 Update `normalizeFileNode` in `useFileTree.ts` to apply `toForwardSlashes` to `rawPath` before passing it to `toRelativePath`
- [x] 2.6 Update `feed` (file watcher handler) in `useFileTree.ts` to normalize `packet.file` via `toForwardSlashes` before calling `isPathInsideDirectory` and `toRelativePath`

## 3. Fix App.vue Path Display Functions

- [x] 3.1 Update `treeDirectoryName` computed in `App.vue` to normalize `raw` via `toForwardSlashes` (or an equivalent local helper) before splitting on `/` to extract the last segment — handles `C:\Users\foo\project` → `project`
- [x] 3.2 Update `normalizeDirectory` local function in `App.vue` to call `toForwardSlashes` before trimming trailing slashes
- [x] 3.3 Update `replaceHomePrefix` in `App.vue` to skip `~` substitution gracefully for Windows paths (drive-letter paths like `C:/...`) instead of falling through incorrectly
- [x] 3.4 Update `resolveWorktreeRelativePath` in `App.vue` to handle Windows absolute paths correctly (the `startsWith('/')` guard currently causes Windows paths to be returned without relativization)

## 4. Fix ProjectPicker and ProjectSettingsDialog

- [x] 4.1 Update path utilities in `ProjectPicker.vue` (`cleanDir`, `parent` calculation, home prefix logic) to handle Windows paths — normalize slashes and handle drive-letter paths
- [x] 4.2 Update `ProjectSettingsDialog.vue` worktree basename extraction (`parts = w.replace(/\/+$/, '').split('/')`) to normalize backslashes first

## 5. Verify and Test

- [x] 5.1 Manually verify that the file tree populates correctly when `activeDirectory` is a Windows-style path (can be tested by temporarily hardcoding a Windows path in `useFileTree` or using a mock)
- [x] 5.2 Verify file watcher events are processed correctly with Windows-style paths (check `isPathInsideDirectory` and `toRelativePath` with test inputs)
- [x] 5.3 Verify `treeDirectoryName` returns correct last segment for both `C:\Users\foo\project` and `/home/user/project`
- [x] 5.4 Run `bun run build` and confirm no TypeScript errors introduced
