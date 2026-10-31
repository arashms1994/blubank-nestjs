# blubank

A pnpm and Turborepo monorepo containing the Bluebank frontend, admin, and backend applications.

## Project structure

```text
apps/
  frontend/              Next.js App Router application
  admin/                 React and Vite administration application
  backend/               NestJS API application
packages/
  eslint-config/         Shared flat ESLint presets
  typescript-config/     Shared strict TypeScript presets
.husky/                  Commit hooks
.vscode/                 Recommended editor settings and extensions
package.json             Root scripts and development tools
pnpm-workspace.yaml      Workspace and approved dependency build scripts
turbo.json               Task graph and cache settings
```

## Prerequisites

- Node.js 26.13 LTS (the current line in `.nvmrc`); Node.js 24.19 or newer within 24.x is also supported
- Corepack, included with Node.js
- pnpm 12.16.1, selected by the root `packageManager` field

Enable Corepack if needed, then install dependencies and start all apps:

```sh
corepack enable
pnpm install
pnpm dev
```

The development servers use these ports:

| App        | Stack                             | Port |
| ---------- | --------------------------------- | ---: |
| `frontend` | Next.js App Router and TypeScript | 3000 |
| `admin`    | React, Vite, and TypeScript       | 5173 |
| `backend`  | NestJS and TypeScript             | 4000 |

Each app includes an `.env.example` with its port. Next.js and Vite read app-local `.env` files; NestJS uses port 4000 by default and accepts a process-level `PORT` override.

## Root commands

| Command             | Purpose                                                 |
| ------------------- | ------------------------------------------------------- |
| `pnpm dev`          | Start all three development servers                     |
| `pnpm dev:frontend` | Start only the frontend                                 |
| `pnpm dev:admin`    | Start only the admin app                                |
| `pnpm dev:backend`  | Start only the backend                                  |
| `pnpm build`        | Build all apps in dependency order                      |
| `pnpm start`        | Start the production servers after building             |
| `pnpm lint`         | Run ESLint across the apps                              |
| `pnpm lint:fix`     | Run ESLint with automatic fixes                         |
| `pnpm format`       | Format workspace files with Prettier                    |
| `pnpm format:check` | Check formatting without writing changes                |
| `pnpm typecheck`    | Type-check all apps                                     |
| `pnpm test`         | Run app test suites; apps without tests succeed cleanly |
| `pnpm clean`        | Remove generated build and cache output                 |

From an app directory, the matching `dev`, `build`, `start`, `lint`, `typecheck`, `test`, and `clean` scripts can also be run with `pnpm --filter <app> <script>`.

## Add an app or package

Create app directories under `apps/` or config/tooling packages under `packages/`; pnpm discovers both through `pnpm-workspace.yaml`. Give each workspace a unique package name. Add shared dependencies with `workspace:*`, and add a script with the same name to each app when you want Turborepo to orchestrate it. Add the task's cache inputs and outputs to `turbo.json` when it produces artifacts.

## Shared configuration

`@repo/typescript-config` provides `base.json`, `nextjs.json`, `vite-react.json`, and `nestjs.json`. Each app extends the framework preset and keeps only its local include paths and aliases. Nest's TypeScript preset enables decorators and uses bundler resolution to type-check Nest 12's ESM package declarations. Its SWC build uses `.swcrc` to emit CommonJS for the backend runtime.

`@repo/eslint-config` provides flat config presets at `/base`, `/next`, `/react-vite`, and `/nest`. The shared presets use type-aware typescript-eslint rules, import sorting, the Turbo environment rule, and `eslint-config-prettier`. React apps add Hooks and Refresh checks; the frontend uses the official Next ESLint config.

Prettier settings live at the root. Turbo hashes environment values declared in task configuration and root or app `.env*` files, so changing environment configuration invalidates affected cache entries.

## Commit conventions

Use Conventional Commit messages such as `feat(frontend): add sign-in page` or `chore: update workspace tooling`. Husky runs lint-staged before commits and commitlint validates commit messages.
