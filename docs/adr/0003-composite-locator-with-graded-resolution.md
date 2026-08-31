# Composite locator with graded resolution

A modification points at a locator holding a structural path, a content fingerprint, and a
human-readable text hint, resolved in four graded tiers: exact, drift, re-anchor, stale.

## Considered options

A bare CSS selector is the obvious choice and was rejected: it has one failure mode — it
matches or it doesn't — so any edit to the page silently drops modifications. Server-assigned
positional ids were rejected for storage because they are meaningless across re-fetches (they
survive only as an in-session handle). Text-only anchoring is robust to markup churn but
ambiguous wherever text repeats.

## Consequences

Storage carries redundant identity on purpose. In exchange, ordinary site edits degrade
gracefully: content edits still apply, moved elements re-anchor, and only genuinely
unresolvable modifications go stale — retained and surfaced rather than lost.
