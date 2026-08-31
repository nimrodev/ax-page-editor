# AX Page Editor — Build Brief (prompt text)

I am building a take-home assignment for a Full-Stack role at Axioma, a company building
"Agent Experience" (AX) infrastructure. It is due Thursday 2026-09-03. I have roughly three
working evenings/days, ~16-20 hours total. Below is my plan. Stress-test it.

## The assignment

Build an **AX Editor**: a visual, CMS-style editor (think Elementor or Webflow's inspector
panel) that lets a publisher load a target webpage, click any element, and annotate or modify
how that page should appear to AI agents. The user is a publisher/website owner, not a
developer.

Required user flow: open the editor -> load a target webpage -> the editor renders a preview
-> click an element to select it -> the inspector exposes modification controls -> apply
modifications across the page -> save the configuration.

Required frontend (React + TypeScript): two-panel layout (page preview as it would be served
to an agent after modification, plus a modifications editor); clickable element selection with
clear visual highlight; inspector reflecting the selected element's tag, text content, and
current modifications; all three modification types; a save button storing the full
configuration (format is my design decision); ability to review and remove applied
modifications.

Three mandatory modification types:
1. **Hide from agents** — mark an element as hidden; if the page is read by an agent, the
   element must not be accessible to it.
2. **Add context** — attach explanatory text to any element to enrich it for agents (what a
   chart shows, what a CTA does, what a section is about). Where this lives in the output and
   how an agent consumes it is explicitly part of what's being judged.
3. **Context-forward a link** — most agents don't follow links or run JavaScript, so a good AX
   follows links on the agent's behalf, server-side. When an `<a>` is selected, fetch what the
   link leads to and inline that content for the agent.

Graded on: product thinking, data schema design, code quality, edge case handling, and
"finish" — does it feel like a real tool or a scaffolded proof of concept. The assignment is
deliberately vague; they state they are testing whether I can write a spec and then execute it.
Deliverables: source code, README (setup, architecture overview, limitations and future
improvements), and a short screen recording.

## My framing

The editor is the visible surface, but the real deliverable is a transform:
`(source URL, modification set) -> agent-facing representation of the page`.
The UI is a way to author that modification set. Two consequences drive the architecture:

1. **Modifications are declarative data applied at render time**, never mutations of a saved
   HTML copy. The source page changes underneath us; the patch set must degrade gracefully.
2. **"Hidden from agents" must be true at the byte level.** `display:none`, `aria-hidden`, or
   a CSS class is not hiding — an agent reading raw HTML still sees the text. Hidden elements
   are deleted from the agent output. This forces a server-side render path.

## Architecture

**Stack.** npm workspaces: `apps/web` (React + TypeScript + Vite + Tailwind), `apps/server`
(NestJS + TypeScript, default Express platform), `packages/schema` (shared types + zod validators, so the
modification schema has exactly one definition). Storage: SQLite (one table, one JSON
document per normalized URL) behind a repository interface, chosen because the config is
always read and written whole, needs atomic writes, and requires zero setup from a reviewer —
Postgres with JSONB is the production answer once there are multiple tenants and concurrent
editors, and swapping is one file. Server libs: jsdom for the mutable tree, Readability for link extraction,
sanitize-html for cleaning, Turndown for Markdown.

**Pipeline.** Client POSTs a URL; the server fetches it (SSRF-guarded, timeout, size cap),
parses to a DOM, sanitizes it (strips `<script>`, `on*` handlers, `javascript:`, form actions,
nested iframes), rewrites relative URLs to absolute, assigns a `data-ax-id` to every element,
and returns it. The client renders that HTML into a sandboxed `<iframe srcdoc>` with an
injected selection overlay; clicks post the ax-id, tag and text back to the host app over
postMessage. A second endpoint takes `{url, modifications}` and returns the agent-facing
output.

I chose an iframe over rendering a parsed JSON tree with React components because it preserves
the page's real appearance for click-targeting and gives a hard security boundary. I rejected
Shadow DOM (weaker isolation, host CSS conflicts) and client-side fetching (dies on CORS, and
removes the server-side link-following the assignment requires).

**Element identity** is the hard problem and I'm solving it first. A modification points at
"that element", and that pointer must survive a re-fetch, DOM churn, injected nodes, and
reordering. Each target stores a composite locator: a structural path
(`main>article>div:nth-of-type(2)>p:nth-of-type(1)`), a content fingerprint
(`sha1(tag + normalized text + href/src)`), and a human-readable text hint. Resolution is
graded: exact path match -> path valid but fingerprint mismatch (apply, warn) -> fingerprint
found elsewhere in the document (re-anchor, record drift) -> no match (mark the modification
stale, skip it, surface it in the UI). `data-ax-id` is an in-session handle only; it is
positional and meaningless across re-fetches, so it is never persisted.

**Schema.** One document per URL: a flat, order-independent list of type-tagged modifications,
each with a stable client-generated id, a target locator, and a typed value. One modification
per (target, type) — the UI upserts rather than appending duplicates. Nothing derived is
stored: no cached HTML, no resolved link content, so the document stays readable, diffable and
portable across page versions. I rejected keying modifications by selector (compact, but makes
list/remove/diff awkward and collapses when a selector re-anchors).

**Agent output.** Two representations from the same modified tree: cleaned semantic HTML, and
Markdown (what most LLM crawlers actually consume). Hidden elements are removed from the tree
entirely. Context is emitted as a real, parseable text node adjacent to its element — not a
`data-*` attribute alone, not an HTML comment, not `aria-label`, because agents that strip
attributes or comments would lose it, and the entire point is that the agent reads it.
`data-ax-context` / `data-ax-forwarded` attributes are layered on as provenance markers so a
downstream consumer can distinguish publisher annotation from original page content. Forwarded
link content is inlined in a marked section after the anchor.

**Context-forwarding** happens server-side at render time, not at save time: validate the href
against the SSRF guard, fetch with a ~5s timeout and ~1MB cap, extract the main content, strip
nav/footer, truncate at a block boundary with explicit truncation marking, and cache by URL
with a short TTL. Depth is capped at 1 (no recursive forwarding); self and cycle links are
skipped; non-HTML content types (PDF, image) render a typed placeholder; failed fetches render
a visible error node rather than silently disappearing.

**Security.** Scheme allowlist; DNS-resolve then block private, loopback, link-local and cloud
metadata ranges; block redirects landing in those ranges and cap redirect count; sanitize
fetched HTML before it reaches the iframe; sandbox the preview frame without combining
`allow-scripts` with `allow-same-origin`; escape user-supplied context text on output; enforce
request timeouts, response size caps, and a per-render fetch budget.

## Product decisions

- The preview panel has a **Human view / Agent view toggle**. The assignment asks for a preview
  "as it would be served to an agent"; the toggle satisfies that literally while keeping a
  styled, clickable surface to author against.
- A **Compare mode** splits the preview into human-left / agent-right, collapsing the inspector
  to a strip. It is not the default: three full columns on a laptop leaves a real webpage
  render too cramped to author against, so Compare is an on-demand mode for reviewing and for
  the demo. Because the agent output carries the same `data-ax-id`s, selecting an element on
  the left highlights the corresponding region on the right — and hiding it makes it visibly
  disappear from the agent pane in real time. Clicking stays left-only; the agent pane is
  read-only output.
- **Agent view is the default on first load**, with a one-line banner: "This is what an AI agent
  sees today." On a JS-heavy page it is nearly empty — that reveal is the demo's opening move.
- A **live token counter** in the header shows the agent payload shrinking as modifications are
  applied (e.g. 47,200 -> 6,800 tokens).
- A **"Test with an agent"** panel sends the before and after agent output to an LLM with fixed
  questions ("What does this page sell? What's the price? What's the primary CTA?") and shows
  the two answers side by side — proving the modification changed agent behaviour, not just
  markup. Ships with recorded fixture responses so it runs with no API key; live mode when
  `ANTHROPIC_API_KEY` is set.
- **Selection UX**: a breadcrumb of ancestors under the preview plus arrow-key parent/child
  navigation, because clicking a `<span>` when you meant the `<section>` is the core usability
  problem of this kind of editor.
- The inspector shows tag, truncated text, resolved locator, and the modifications on the
  selected element, each individually removable. A global modifications list handles review,
  removal, and surfacing stale modifications.
- Copy is written for publishers, not developers: "Hide from AI agents", never "set display:none".

## Scope and schedule

Mon night (~3h): scaffold, shared schema package, fetch/sanitize/SSRF. No UI work.
Tue (~6h): locator + resolver, iframe preview, click-select, inspector, `hide` end to end.
  Gate at Tue midnight: URL -> click -> agent output actually changes.
Wed (~7h): `context` and `forwardLink`, save/load, list and remove (~4h); then, in order,
  token counter, agent-view default, Compare mode with cross-highlighting, breadcrumb
  navigation, agent A/B panel (~4h).
  Hard feature freeze Wed 20:00; remaining time goes to error and empty states.
Thu (~3h): README, SPEC.md, and the screen recording. No coding.
Tests throughout — Jest on the server (Nest's default, no tooling detour), vitest on the web
app: the locator resolver (drift, re-anchor, stale), each modification transform, and the SSRF
guard. The domain layer (locator, transforms, fetcher, sanitizer) is written as plain classes
and functions with no Nest decorators, so it is unit-testable without a testing module and the
framework stays confined to the HTTP edge. A single feature module, thin controllers, a small
zod validation pipe rather than class-validator DTOs so `packages/schema` remains the one
definition, the SSRF check as a guard, and the forwarded-link cache as an interceptor.
Triage order if I slip: breadcrumb navigation, then the agent A/B panel, then tests beyond the
locator suite, then the locator re-anchor tier (still store the fingerprint, document the gap).
Never cut: the three modification types, save/load, the README, or the recording.

## What I want from you

Grill this plan. Attack the framing, the element-identity scheme, the schema, the choice of
where context lives in the agent output, the security model, the scope for the time available,
and whether this reads as a real tool or a proof of concept to the people grading it.
