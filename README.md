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

### Backend HTTP configuration

The backend exposes probe health at `/health`; application routes use `/api/v1/`. Set `CORS_ORIGINS` to a comma-separated list of browser origins. It may be empty in development and must contain at least one origin in production. `TRUST_PROXY` defaults to `false`; enable it only when the backend is behind a trusted proxy. Fastify then derives `request.ip` from forwarded headers. `BODY_LIMIT_BYTES` defaults to `1048576` (1 MB) and can be lowered per environment; startup rejects values above the 1 MB maximum.

For local development in PowerShell:

```powershell
$env:NODE_ENV = 'development'
$env:HOST = '127.0.0.1'
$env:PORT = '4000'
$env:BODY_LIMIT_BYTES = '1048576'
$env:CORS_ORIGINS = 'http://localhost:3000'
$env:TRUST_PROXY = 'false'
pnpm dev:backend
```

In another PowerShell window, check the probe and a versioned route:

```powershell
curl.exe --fail http://127.0.0.1:4000/health
curl.exe -i http://127.0.0.1:4000/api/v1/unknown
```

The health request returns `{"status":"ok"}` and the unknown API route returns 404. Stop the server with `Ctrl+C`. For production, set `NODE_ENV=production` and provide at least one `CORS_ORIGINS` value, then run `pnpm --filter backend build` followed by `pnpm --filter backend start`.

## Add an app or package

Create app directories under `apps/` or config/tooling packages under `packages/`; pnpm discovers both through `pnpm-workspace.yaml`. Give each workspace a unique package name. Add shared dependencies with `workspace:*`, and add a script with the same name to each app when you want Turborepo to orchestrate it. Add the task's cache inputs and outputs to `turbo.json` when it produces artifacts.

## Shared configuration

`@repo/typescript-config` provides `base.json`, `nextjs.json`, `vite-react.json`, and `nestjs.json`. Each app extends the framework preset and keeps only its local include paths and aliases. Nest's TypeScript preset enables decorators and uses bundler resolution to type-check Nest 12's ESM package declarations. Its SWC build uses `.swcrc` to emit CommonJS for the backend runtime.

`@repo/eslint-config` provides flat config presets at `/base`, `/next`, `/react-vite`, and `/nest`. The shared presets use type-aware typescript-eslint rules, import sorting, the Turbo environment rule, and `eslint-config-prettier`. React apps add Hooks and Refresh checks; the frontend uses the official Next ESLint config.

Prettier settings live at the root. Turbo hashes environment values declared in task configuration and root or app `.env*` files, so changing environment configuration invalidates affected cache entries.

## Commit conventions

Use Conventional Commit messages such as `feat(frontend): add sign-in page` or `chore: update workspace tooling`. Husky runs lint-staged before commits and commitlint validates commit messages.
