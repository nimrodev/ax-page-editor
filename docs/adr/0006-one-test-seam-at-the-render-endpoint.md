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
