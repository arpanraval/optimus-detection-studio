# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project aims to follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Open-source release scaffolding: AGPL-3.0 `LICENSE`, `NOTICE` (MITRE ATT&CK®
  and SigmaHQ/pySigma attribution), `SECURITY.md`, `CONTRIBUTING.md`, and a
  Code of Conduct.
- Self-hosted setup: a single consolidated `supabase/schema.sql`,
  `supabase/config.toml`, a `bun run setup` installer, a `bun run setup:check`
  doctor, and an optional `supabase/optional-scheduled-jobs.sql` for background
  automation.
- CI: `schema-check` (applies `schema.sql` to an empty Postgres to prove a fork
  can build the backend from zero) and `ci` (type-check, test, build).
- GitHub issue/PR templates and CODEOWNERS.

### Fixed
- **Sigma Rule Converter** failed to initialize in the browser: `pysigma` 1.4.0
  added a hard `jq` dependency, which has no pure-Python/WASM wheel and cannot be
  installed by micropip in Pyodide. Pinned `pysigma<1.4` (the last jq-free 1.x
  line) to restore engine initialization.

### Changed
- ESLint config no longer scans tooling/cache directories, so `bun run lint`
  reports only real project findings.

## [1.0.0]

Initial platform: AI-augmented detection library, MITRE ATT&CK coverage
analytics, the Optimus Prime AI agent, AI query generation, threat-intel digest,
bulk vendor import, browser-based Sigma conversion, collaborative review
workflows, five-tier RBAC, and SIEM/XDR deployment across six providers.
