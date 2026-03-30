## ADDED Requirements

### Requirement: Paths are normalized to forward slashes before use
All file and directory paths received from the OpenCode server or the file watcher SHALL be normalized to use forward slashes (`/`) as the separator before any comparison, splitting, or tree-building operation. Backslash characters (`\`) SHALL be replaced with `/`. Windows drive-letter prefixes (`C:\`, `D:\`, etc.) SHALL be preserved but converted to forward-slash form (`C:/`, `D:/`).

#### Scenario: Backslash path normalized for tree building
- **WHEN** the OpenCode server returns a worktree path such as `C:\Users\foo\project`
- **THEN** the path is normalized to `C:/Users/foo/project` before being stored as `activeDirectory`

#### Scenario: File watcher event path matched against directory
- **WHEN** a `file.watcher.updated` packet arrives with `file = "C:\Users\foo\project\src\index.ts"`
- **THEN** `isPathInsideDirectory` normalizes both paths and correctly identifies the file as inside the active directory
- **AND** the file tree updates accordingly

#### Scenario: Relative path computed correctly on Windows
- **WHEN** `toRelativePath` is called with an absolute Windows path and a Windows directory path
- **THEN** the result is a forward-slash relative path (e.g., `src/index.ts`)

### Requirement: Directory name display works for Windows paths
The `treeDirectoryName` computation SHALL extract the last path segment correctly for both Unix paths (`/home/user/project` → `project`) and Windows paths (`C:\Users\foo\project` → `project` or `C:/Users/foo/project` → `project`).

#### Scenario: Unix path returns last segment
- **WHEN** `activeDirectory` is `/home/user/myapp`
- **THEN** `treeDirectoryName` returns `myapp`

#### Scenario: Windows path returns last segment
- **WHEN** `activeDirectory` is `C:\Users\foo\myapp` or `C:/Users/foo/myapp`
- **THEN** `treeDirectoryName` returns `myapp`

### Requirement: Home prefix replacement handles non-Unix paths
`replaceHomePrefix` SHALL return the normalized path unchanged (without the `~` substitution) when the path is a Windows absolute path that cannot start with `/`. It SHALL NOT return an empty string or throw for Windows paths.

#### Scenario: Unix path with home prefix replaced
- **WHEN** `homePath` is `/home/user` and the path is `/home/user/project`
- **THEN** the result is `~/project`

#### Scenario: Windows path returned as-is
- **WHEN** the path is `C:/Users/foo/project`
- **THEN** the result is `C:/Users/foo/project` (no substitution, no error)

### Requirement: Path-inside-directory check is slash-agnostic
`isPathInsideDirectory` SHALL correctly determine containment even when one or both paths use backslashes as separators.

#### Scenario: Both paths use backslashes
- **WHEN** `path = "C:\Users\foo\project\src\file.ts"` and `directory = "C:\Users\foo\project"`
- **THEN** the function returns `true`

#### Scenario: Mixed slash styles
- **WHEN** `path = "C:/Users/foo/project/src/file.ts"` and `directory = "C:\Users\foo\project"`
- **THEN** the function returns `true`
