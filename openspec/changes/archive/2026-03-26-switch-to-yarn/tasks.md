## 1. Configure Yarn

- [x] 1.1 Run `corepack use yarn@stable` (or `yarn@4`) in the project root to update the `packageManager` field in `package.json` to the current stable yarn version
- [x] 1.2 Create `.yarnrc.yml` at the repo root with `nodeLinker: node-modules`

## 2. Remove pnpm Artifacts

- [x] 2.1 Delete `pnpm-lock.yaml`
- [x] 2.2 Delete `pnpm-workspace.yaml`

## 3. Generate Yarn Lockfile

- [x] 3.1 Run `yarn install` to generate `yarn.lock` and populate `node_modules`
- [x] 3.2 Run `yarn run build` to verify the build succeeds and `dist/` is produced

## 4. Update CI Workflows

- [x] 4.1 Update `.github/workflows/deploy.yaml`: remove `pnpm/action-setup@v4` step, add `corepack enable` step, change `pnpm -r install --frozen-lockfile` to `yarn install --immutable`, change `pnpm run build` to `yarn run build`, update `actions/setup-node` cache from `pnpm` to `yarn`
- [x] 4.2 Update `.github/workflows/publish.yaml`: remove `pnpm/action-setup@v4` step, add `corepack enable` step, change `pnpm -r install --frozen-lockfile` to `yarn install --immutable`, update `actions/setup-node` cache from `pnpm` to `yarn`

## 5. Verify

- [x] 5.1 Confirm `yarn.lock` exists and `pnpm-lock.yaml` does not exist in the repo root
- [x] 5.2 Confirm `.yarnrc.yml` contains `nodeLinker: node-modules`
- [x] 5.3 Confirm neither workflow file references `pnpm/action-setup`
- [x] 5.4 Commit all changes: `yarn.lock`, `.yarnrc.yml`, updated `package.json`, updated workflows, deleted pnpm files
