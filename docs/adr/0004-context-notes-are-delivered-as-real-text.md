# Context notes are delivered as real text

A context note is emitted as a parseable text node adjacent to its element — `<span
data-ax-context>` in HTML, an adjacent note in Markdown — rather than as a `data-*` attribute
alone, an HTML comment, or `aria-label`.

## Considered options

All three rejected alternatives are lost by agents that flatten a page to text, strip
attributes, or drop comments — which is most of them. Since the entire purpose is that the
agent reads the note, any carrier the agent might discard defeats the feature. A JSON-LD
sidecar has the same problem alone, though it would be a reasonable addition.

## Consequences

The `data-ax-*` attributes remain, but as provenance markers rather than as the payload: a
downstream consumer can tell publisher-authored annotation from original page content, which
matters for how it weighs them.
