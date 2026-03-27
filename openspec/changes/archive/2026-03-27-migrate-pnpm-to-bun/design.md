## Context

The project is a single-package Vue 3 / Vite SPA that currently uses pnpm 10.29.3 as its package manager. pnpm is referenced in six places: the `packageManager` field in `package.json`, the lockfile (`pnpm-lock.yaml`), a workspace config file (`pnpm-workspace.yaml`), two CI workflow files, and the README. No runtime source code references pnpm.

## Goals / Non-Goals

**Goals:**
- Replace all pnpm tooling references with Bun equivalents
- Produce a valid `bun.lock` that resolves the same dependency tree
- Keep CI workflows functionally identical (same jobs, same install+build steps)

**Non-Goals:**
- Changing any application dependencies
- Using Bun as a runtime (Node.js remains the runtime for `server.js`)
- Migrating scripts to use Bun APIs

## Decisions

### Use `oven-sh/setup-bun@v2` in CI (over manually downloading Bun)
The official GitHub Action is the standard approach — it handles PATH setup, caching, and version pinning cleanly. The reference commit at `nguyentamdat/vis@92937aa` uses this exact action.

**Alternative considered:** Manually installing Bun via `curl -fsSL https://bun.sh/install | bash` — rejected because it is less maintainable and doesn't integrate with GitHub Actions caching.

### Remove `cache: pnpm` from `setup-node` (not replace with Bun cache)
`oven-sh/setup-bun@v2` handles its own caching internally. The `cache:` field on `actions/setup-node` is pnpm/npm/yarn-specific and is not needed when Bun manages installs.

### Remove `pnpm-workspace.yaml` entirely (not translate to Bun equivalent)
The file only contained `onlyBuiltDependencies: [esbuild]` — a pnpm-specific security restriction that prevents arbitrary lifecycle scripts. Bun does not run `postinstall` scripts by default unless explicitly trusted, so this protection is inherent and no equivalent config file is needed.

### Remove `"packageManager"` field from `package.json` (not replace with `bun@x.y.z`)
The user chose "latest stable" — no version pinning. Removing the field avoids corepack interference (corepack would block `bun` if `packageManager` were still set to a pnpm version).

**Alternative considered:** Setting `"packageManager": "bun@1.x.x"` — deferred; can be added later once a specific version is chosen for pinning.

## Risks / Trade-offs

- **[Risk] `bun install` resolves slightly differently than pnpm** → Mitigation: Run `bun install` and verify `bun run build` succeeds before committing `bun.lock`. The dependency tree is small (19 packages) so divergence is unlikely.
- **[Risk] `--frozen-lockfile` in CI fails if `bun.lock` is not committed** → Mitigation: Commit `bun.lock` as part of this change.
- **[Risk] `pnpm -r install` used `-r` (recursive workspace flag)** → Non-issue: This is a single-package repo; `-r` was redundant. `bun install` without flags covers the same scope.

## Migration Plan

1. Delete `pnpm-lock.yaml` and `pnpm-workspace.yaml`
2. Remove `"packageManager"` field from `package.json`
3. Run `bun install` locally to generate `bun.lock`
4. Update both CI workflow files (action + commands)
5. Update `README.md`
6. Verify `bun run build` produces a clean `dist/`
7. Commit all changes including `bun.lock`

**Rollback:** Restore `pnpm-lock.yaml` from git history, revert `package.json`, revert CI files, delete `bun.lock`, re-add `pnpm-workspace.yaml`.

## Open Questions

<!-- None — migration scope is fully defined by the reference commit -->
