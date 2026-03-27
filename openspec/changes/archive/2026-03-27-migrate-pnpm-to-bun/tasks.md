## 1. Remove pnpm Artifacts

- [x] 1.1 Delete `pnpm-lock.yaml`
- [x] 1.2 Delete `pnpm-workspace.yaml`

## 2. Update package.json

- [x] 2.1 Remove the `"packageManager": "pnpm@10.29.3"` field from `package.json`

## 3. Update CI Workflows

- [x] 3.1 In `.github/workflows/deploy.yaml`: replace `- name: Setup pnpm` / `uses: pnpm/action-setup@v4` with `- name: Setup Bun` / `uses: oven-sh/setup-bun@v2`
- [x] 3.2 In `.github/workflows/deploy.yaml`: remove `cache: pnpm` from the `setup-node` step
- [x] 3.3 In `.github/workflows/deploy.yaml`: replace `pnpm -r install --frozen-lockfile` with `bun install --frozen-lockfile`
- [x] 3.4 In `.github/workflows/deploy.yaml`: replace `pnpm run build` with `bun run build`
- [x] 3.5 In `.github/workflows/publish.yaml`: replace `- name: Setup pnpm` / `uses: pnpm/action-setup@v4` with `- name: Setup Bun` / `uses: oven-sh/setup-bun@v2`
- [x] 3.6 In `.github/workflows/publish.yaml`: remove `cache: pnpm` from the `setup-node` step
- [x] 3.7 In `.github/workflows/publish.yaml`: replace `pnpm -r install --frozen-lockfile` with `bun install --frozen-lockfile`

## 4. Update README

- [x] 4.1 In `README.md`: replace `pnpm install` with `bun install` in the Development section
- [x] 4.2 In `README.md`: replace `pnpm dev` with `bun dev` in the Development section

## 5. Generate Bun Lockfile

- [x] 5.1 Run `bun install` in the project root to generate `bun.lock`

## 6. Verify

- [x] 6.1 Run `bun run build` and confirm it exits successfully with a populated `dist/` directory
