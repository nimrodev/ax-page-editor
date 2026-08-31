# Domain Docs

How to consume this repo's domain documentation when exploring or writing.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the glossary. Domain language only, with the synonyms to
  avoid.
- **`docs/adr/`** — read the ADRs that touch the area you are about to work in.

This is a single-context repo: one `CONTEXT.md` at the root, one `docs/adr/` beside it.

## Use the glossary's vocabulary

When your output names a domain concept — an issue title, a test name, a proposal, a hypothesis
— use the term as `CONTEXT.md` defines it, and avoid the synonyms it lists. Say *target page*,
not source page; *agent payload*, not agent output; *locator*, not selector.

If a concept you need is missing from the glossary, that is a signal: either you are inventing
language the project does not use, or there is a real gap worth recording.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it rather than silently overriding:

> _Contradicts ADR-0003 (composite locator with graded resolution), but worth reopening because…_

## Other documents

- **`SPEC.md`** — the specification: problem, solution, user stories, decisions, testing, scope.
- **`BRIEF.md`** — the working document it was synthesized from; also holds the delivery plan
  and a clause-by-clause coverage table against the original assignment.
