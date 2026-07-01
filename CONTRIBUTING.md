# Contributing to Optimus Detection Studio

Thanks for your interest in contributing! This project is an open-source detection
engineering platform, and contributions of all kinds are welcome — bug reports,
features, detection content, docs, and fixes.

## Ground rules

- Be respectful — see our [Code of Conduct](CODE_OF_CONDUCT.md).
- For anything non-trivial, **open an issue first** to discuss the approach before
  investing in a PR.
- Never commit secrets. `.env.local` is gitignored; API keys live in Supabase
  edge-function secrets, never in the repo.
- Report security issues privately via [SECURITY.md](SECURITY.md) — not as a public issue.

## Development setup

You'll need [Bun](https://bun.sh), the [Supabase CLI](https://supabase.com/docs/guides/cli),
and `psql`, plus your own Supabase project. See **[Setup](README.md#setup)** in the
README for the full walkthrough.

```bash
git clone https://github.com/arpanraval/optimus-detection-studio.git
cd optimus-detection-studio
bun install
cp .env.example .env.local     # add your Supabase URL + anon key
bun run setup                  # stand up your own backend
bun run dev
```

## Before you open a PR

Run the checks locally — CI runs the same:

```bash
bun run lint
bun run type-check
bun run test
bun run build
```

- Keep changes focused; one logical change per PR.
- Match the surrounding code style (the repo uses ESLint + Prettier).
- Add or update tests for behavior changes.
- Update docs (README / inline) when you change setup, config, or public behavior.

## Database changes

The database schema lives in [`supabase/schema.sql`](supabase/schema.sql) — a single,
self-contained snapshot that the `schema-check` CI workflow applies to an empty
Postgres on every change. If your PR changes the schema:

- Update `supabase/schema.sql` accordingly, and
- Make sure the `schema-check` workflow still passes (it asserts the schema applies
  cleanly from empty).

If you're unsure how a schema change should be represented, open an issue first.

## Commit & PR conventions

- Write clear, imperative commit messages (e.g. "Add QRadar Sigma backend").
- Reference related issues (`Fixes #123`).
- Describe *what* changed and *why* in the PR description; include screenshots for UI changes.

## License

By contributing, you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE), the same license as the project.
