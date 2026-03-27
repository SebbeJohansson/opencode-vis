## Why

The project uses pnpm as its package manager, but Bun offers significantly faster installs, a unified toolchain (runtime + package manager in one binary), and native TypeScript support — making it a straightforward, low-risk upgrade for a single-package project of this size.

## What Changes

- Replace `pnpm-lock.yaml` with `bun.lock` (Bun's lockfile)
- Delete `pnpm-workspace.yaml` (only contained `onlyBuiltDependencies: [esbuild]`; not needed in Bun)
- Update `package.json`: remove `"packageManager": "pnpm@10.29.3"` field
- Update `.github/workflows/deploy.yaml`: replace `pnpm/action-setup@v4` with `oven-sh/setup-bun@v2`, remove `cache: pnpm`, update install and build commands
- Update `.github/workflows/publish.yaml`: same CI action and command replacements
- Update `README.md`: replace `pnpm install` / `pnpm dev` with `bun install` / `bun dev`

## Capabilities

### New Capabilities

- `bun-package-management`: Bun is used as the package manager — install commands, lockfile format, and CI integration all use Bun instead of pnpm

### Modified Capabilities

<!-- None — no existing specs exist in this repo -->

## Impact

- **`package.json`**: `packageManager` field removed; no script changes needed (scripts are runner-agnostic)
- **`pnpm-lock.yaml`**: Deleted; replaced by `bun.lock`
- **`pnpm-workspace.yaml`**: Deleted
- **`.github/workflows/deploy.yaml`** and **`publish.yaml`**: Action and command substitutions only; workflow logic unchanged
- **`README.md`**: Dev setup instructions updated
- No runtime source code changes — no `.ts`/`.js` files reference pnpm
