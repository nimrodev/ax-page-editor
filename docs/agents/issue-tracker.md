# Issue Tracker

Issues live in **Linear**, not in this repo's GitHub Issues.

- Workspace team: `Nimrod-projects` (key `NIM`)
- Project: `AX Page Editor`
- Access: the Linear MCP — `list_issues`, `get_issue`, `save_issue`, `save_project`,
  `save_milestone`, `list_teams`. There is no CLI for this tracker; do not reach for
  `gh issue`.

Creating an issue requires `team`; set `project` so it lands in the right place. Blocking
relationships are native: `blockedBy` and `blocks` on `save_issue`, both append-only.

Code lives on GitHub at `nimrodev/ax-page-editor`.

**Commit directly to `main`. Do not open branches or pull requests.** This is a solo repo on a
short deadline; there is no reviewer waiting on a PR, so the branch-and-merge cycle costs time
and buys nothing. Skills that would otherwise create a branch, open a pull request, or mark one
as "closing" an issue should commit to `main` instead and move the Linear issue by hand.

Commit quality still matters, and more than usual: the history is part of what gets read.
Atomic commits, each one a working state, with messages that say why rather than what.

Linear issues carry a `gitBranchName`, which would auto-link a branch and its PR to the issue.
It is unused here as a consequence of committing straight to `main`; issue state is moved
manually.

External pull requests are **not** a request surface for triage.
