# Modifications are data applied at render time

A configuration stores declarative modifications against locators; it never stores a modified
copy of the target page. Every agent payload is built by re-fetching the page and re-applying
the configuration. The page changes underneath us — a stored copy would rot silently and serve
content the publisher never approved, while a re-applied configuration degrades visibly and
per-modification.

## Consequences

Nothing can be served stale, because nothing is materialised. The cost is that every render
pays for a fetch, and that each modification must resolve its locator afresh — which is what
makes drift, re-anchoring, and staleness real states rather than theoretical ones.
