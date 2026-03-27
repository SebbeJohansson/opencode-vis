## ADDED Requirements

### Requirement: Project uses yarn as package manager
The project SHALL declare yarn as its package manager via the `packageManager` field in `package.json`, enabling Corepack to enforce the correct yarn version.

#### Scenario: Developer installs dependencies
- **WHEN** a developer runs `yarn install` in the project root
- **THEN** all dependencies are installed into `node_modules` using the yarn lockfile

#### Scenario: Corepack enforces yarn version
- **WHEN** the `packageManager` field is set to `yarn@<version>` in `package.json`
- **THEN** Corepack SHALL use the specified yarn version when `yarn` commands are run

### Requirement: Yarn lockfile is committed
The project SHALL maintain a `yarn.lock` file at the repository root, tracking all resolved dependency versions.

#### Scenario: Lockfile exists after install
- **WHEN** `yarn install` is run in a fresh checkout
- **THEN** a `yarn.lock` file SHALL exist at the repository root

#### Scenario: No pnpm lockfile present
- **WHEN** the repository is checked out
- **THEN** `pnpm-lock.yaml` SHALL NOT be present

### Requirement: Yarn node-modules linker is configured
The project SHALL configure yarn to use the `node-modules` node linker via `.yarnrc.yml`, ensuring a standard `node_modules` directory layout compatible with all tooling.

#### Scenario: node_modules layout after install
- **WHEN** `yarn install` is run
- **THEN** dependencies SHALL be available under `node_modules/` in the standard layout

#### Scenario: .yarnrc.yml specifies nodeLinker
- **WHEN** `.yarnrc.yml` is read
- **THEN** it SHALL contain `nodeLinker: node-modules`

### Requirement: CI workflows use yarn
Both GitHub Actions workflows (`deploy.yaml` and `publish.yaml`) SHALL use yarn to install dependencies, replacing pnpm-specific steps.

#### Scenario: Deploy workflow installs with yarn
- **WHEN** the deploy workflow runs
- **THEN** it SHALL enable Corepack and run `yarn install --immutable` to install dependencies

#### Scenario: Publish workflow installs with yarn
- **WHEN** the publish workflow runs
- **THEN** it SHALL enable Corepack and run `yarn install --immutable` to install dependencies

#### Scenario: No pnpm action in workflows
- **WHEN** either CI workflow file is read
- **THEN** `pnpm/action-setup` SHALL NOT appear in any workflow step

### Requirement: Build succeeds with yarn
Running the build script via yarn SHALL produce the same output as the previous pnpm-based build.

#### Scenario: Successful build
- **WHEN** `yarn run build` is executed
- **THEN** the build SHALL complete without errors and produce output in `dist/`
