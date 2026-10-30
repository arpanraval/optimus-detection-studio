## What & why
Briefly describe the change and the motivation. Link related issues (e.g. `Fixes #123`).

## Type of change
- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / cleanup
- [ ] Docs
- [ ] Database schema change (updates `supabase/schema.sql`)

## Checklist
- [ ] `bun run lint` passes (warnings reviewed)
- [ ] `bun run type-check` passes
- [ ] `bun run type-check:setup` passes if setup scripts changed
- [ ] `bun run test` passes
- [ ] `bun run build` succeeds
- [ ] No secrets committed (keys/tokens live in Supabase secrets, not the repo)
- [ ] Docs updated if setup/config/public behavior changed
- [ ] If the schema changed, `supabase/schema.sql` is updated and the `schema-check` workflow passes

## Screenshots (for UI changes)
_Before / after, if applicable._
