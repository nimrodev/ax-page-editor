# One test seam at the render endpoint

Product behaviour is tested through a single seam — the render endpoint, taking a URL and a
configuration and returning an agent payload — rather than by unit-testing the resolver,
emitters, and sanitizer individually. Only the SSRF guard and URL normalization are tested
directly, because their cases are awkward to provoke through the endpoint or are pure functions
over a table.

## Consequences

Tests read as statements about the product ("a hidden element and its subtree are absent from
the payload") and survive any internal reshaping of the components that produce it. The
trade-off is coarser failure localisation: a broken emitter and a broken resolver can fail the
same test. This is deliberate — a suite coupled to internal structure goes red on the first
refactor and gets deleted rather than repaired.

## Update

Practice diverged from this as the resolver, sanitizer, and emitters grew their own edge cases
(drift and re-anchor tiers, shadowing, base-href rewriting) that were awkward to provoke through
the render endpoint alone — the same reasoning this ADR already applied to the SSRF guard and
URL normalization turned out to apply far more broadly than anticipated. Nearly every module
under `apps/server/src` now has its own unit test file alongside `render-page.test.ts`, which
still carries the product-level, endpoint-shaped tests this ADR describes. Failure localisation
won out over the original bet more often than expected; the "read as a product statement"
tests haven't gone away, they're just no longer the only layer.
