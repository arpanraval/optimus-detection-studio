# Repository Guidelines

## Project Structure & Module Organization
This is a Bun/Vite React TypeScript app. Frontend code lives in `src/`: routing in `src/router`, pages in `src/router/pages`, reusable UI in `src/components`, hooks in `src/hooks`, context providers in `src/context`, services in `src/services`, utilities in `src/lib`, and shared types in `src/types`. Static assets and MITRE data live in `public/`. Supabase backend code is under `supabase/`, with Edge Functions in `supabase/functions`, migrations in `supabase/migrations`, and the canonical database snapshot in `supabase/schema.sql`. Utility and setup scripts live in `scripts/`.

## Build, Test, and Development Commands
- `bun install --frozen-lockfile`: install the exact dependency set used by CI.
- `bun run dev`: start the Vite development server.
- `bun run build`: create the production build in `dist/`.
- `bun run preview`: serve the built app locally.
- `bun run lint` / `bun run lint:fix`: run ESLint, optionally applying fixes.
- `bun run type-check`: run `tsc --noEmit`.
- `bun run test` / `bun run test:watch`: run Vitest once or in watch mode.
- `bun run setup` / `bun run setup:check`: provision and validate local Supabase setup.

## Coding Style & Naming Conventions
Use TypeScript and TSX with 2-space indentation, semicolons, single quotes, trailing commas, and a 120-character print width. Prettier owns formatting; ESLint enforces JS/TS recommendations, React Hooks rules, warns on `any`, ignores unused `_` variables, and allows only `console.warn`/`console.error`. Use PascalCase for components and contexts, `use*` for hooks, and keep shared UI primitives in `src/components/ui`. Prefer the `@` alias for imports from `src`.

## Testing Guidelines
Vitest runs with `jsdom` and globals enabled. Place frontend tests as `*.test.ts` or `*.test.tsx` under `src/**/__tests__/`; shared Supabase function tests belong under `supabase/functions/_shared/__tests__/`. Targeted backend tests in `supabase/tests` can be run with `bunx vitest run supabase/tests/<file>.test.ts`. Add tests for behavior changes; there is no formal coverage threshold.

## Commit & Pull Request Guidelines
Recent history uses scoped, conventional-style subjects such as `fix(mitre): ...`, `docs(setup): ...`, and `ci(security): ...`. Keep commits imperative and focused. PRs should explain what changed and why, link issues with `Fixes #123` when relevant, include screenshots for UI changes, and confirm `bun run type-check`, `bun run test`, and `bun run build` pass. For database changes, update `supabase/schema.sql` and ensure the schema-check workflow still applies cleanly.

## Security & Configuration Tips
Never commit secrets. Start from `.env.example`, keep local values in `.env.local`, and store Edge Function keys in Supabase secrets. Report security issues privately through `SECURITY.md`.
