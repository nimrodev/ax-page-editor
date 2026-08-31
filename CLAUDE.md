# AX Page Editor

A visual editor letting publishers control how their pages are represented to AI agents: hiding
noise, explaining what is ambiguous, and pulling in what sits behind a link.

Read [`SPEC.md`](SPEC.md) first. Vocabulary is in [`CONTEXT.md`](CONTEXT.md) — use its terms and
avoid the synonyms it lists. Decisions are in [`docs/adr/`](docs/adr/); flag contradictions
rather than silently overriding them.

## Agent skills

### Issue tracker

Linear — team `Nimrod-projects` (`NIM`), project `AX Page Editor`, via the Linear MCP. Branch
names from an issue's `gitBranchName` link GitHub pull requests back to it. See
`docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
