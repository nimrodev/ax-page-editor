# Issue Tracker

Issues live in **Linear**, not in this repo's GitHub Issues.

- Workspace team: `Nimrod-projects` (key `NIM`)
- Project: `AX Page Editor`
- Access: the Linear MCP — `list_issues`, `get_issue`, `save_issue`, `save_project`,
  `save_milestone`, `list_teams`. There is no CLI for this tracker; do not reach for
  `gh issue`.

Creating an issue requires `team`; set `project` so it lands in the right place. Blocking
relationships are native: `blockedBy` and `blocks` on `save_issue`, both append-only.

Code and pull requests live on GitHub at `nimrodev/ax-page-editor`. The two systems are linked
by **branch name**: every Linear issue exposes a `gitBranchName` (for example
`nimrodinbox/nim-12-verify-demo-pages`). Branch with that exact name and Linear attaches the
branch and its pull request to the issue and advances its state. Any skill that would otherwise
open a pull request "closing" an issue should rely on this instead.

External pull requests are **not** a request surface for triage. The `triage` skill is not in
use on this repo, and no triage label vocabulary is configured.
