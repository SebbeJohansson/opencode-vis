### Requirement: Bun is used as the package manager
The project SHALL use Bun as its package manager. The `bun.lock` lockfile SHALL be committed to the repository. The `pnpm-lock.yaml` and `pnpm-workspace.yaml` files SHALL NOT exist.

#### Scenario: Developer installs dependencies
- **WHEN** a developer runs `bun install` in the project root
- **THEN** all dependencies are installed and `bun.lock` is updated if needed

#### Scenario: Lockfile is present after install
- **WHEN** `bun install` completes successfully
- **THEN** a `bun.lock` file exists at the project root

### Requirement: CI uses Bun for install and build
CI workflows SHALL set up Bun using `oven-sh/setup-bun@v2` and install dependencies with `bun install --frozen-lockfile`. The pnpm action (`pnpm/action-setup`) SHALL NOT be used.

#### Scenario: Deploy workflow installs and builds
- **WHEN** the deploy CI workflow runs
- **THEN** it sets up Bun via `oven-sh/setup-bun@v2`, runs `bun install --frozen-lockfile`, and runs `bun run build`

#### Scenario: Publish workflow installs dependencies
- **WHEN** the publish CI workflow runs
- **THEN** it sets up Bun via `oven-sh/setup-bun@v2` and runs `bun install --frozen-lockfile` before publishing

#### Scenario: CI install fails on lockfile mismatch
- **WHEN** `package.json` has been modified without updating `bun.lock`
- **THEN** `bun install --frozen-lockfile` exits with a non-zero status, failing the CI job

### Requirement: README documents Bun for development setup
The README development section SHALL instruct developers to use `bun install` and `bun dev` to set up and run the project locally.

#### Scenario: Developer follows README instructions
- **WHEN** a developer runs `bun install` followed by `bun dev` as described in the README
- **THEN** dependencies are installed and the Vite dev server starts successfully
