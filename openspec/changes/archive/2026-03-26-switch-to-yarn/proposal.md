## Why

The project currently uses pnpm as its package manager, but the team wants to standardize on yarn. Switching eliminates the pnpm-specific lockfile, workspace config, and CI setup in favor of yarn equivalents.

## What Changes

- Replace `pnpm-lock.yaml` with `yarn.lock`
- Remove `pnpm-workspace.yaml` (or replace with yarn workspace config if needed)
- Update `packageManager` field in `package.json` from `pnpm@10.29.3` to the appropriate yarn version
- Update `.github/workflows/deploy.yaml` to use yarn for install and build steps
- Update `.github/workflows/publish.yaml` to use yarn for install steps
- Delete `pnpm-lock.yaml` and generate `yarn.lock` via `yarn install`

## Capabilities

### New Capabilities

- `yarn-package-manager`: Project is installable and buildable using yarn instead of pnpm, with a yarn lockfile and yarn-based CI workflows

### Modified Capabilities

<!-- No existing spec-level requirement changes -->

## Impact

- `package.json`: `packageManager` field update
- `pnpm-lock.yaml`: removed
- `pnpm-workspace.yaml`: removed (single-package repo, no workspace patterns defined)
- `.github/workflows/deploy.yaml`: pnpm actions replaced with yarn equivalents
- `.github/workflows/publish.yaml`: pnpm actions replaced with yarn equivalents
- Developer environment: contributors must use yarn instead of pnpm
