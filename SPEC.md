# AX Page Editor

Vocabulary in [`CONTEXT.md`](CONTEXT.md). Decisions in [`docs/adr/`](docs/adr/).

## Problem Statement

A publisher's page is increasingly read by AI agents rather than by people, and the publisher
has no control over — or even visibility of — what those agents take away from it.

Agents do not see design. They consume text, they do not execute JavaScript, and they largely
do not follow links. So navigation, cookie notices and footer boilerplate arrive as content of
equal weight to the article. A chart is a blank. A form input is unexplained. A link carrying
the actual answer is never followed. The publisher can edit the page for humans, and has no
lever at all for the software now mediating a growing share of their audience.

## Solution

A visual editor where a publisher loads one of their own pages, immediately sees what an agent
currently reads from it, and corrects that: hiding what is noise, explaining what is ambiguous,
and pulling in what sits behind a link.

They work by clicking elements on a preview of the page, as they would in a page builder, and
save the result as a configuration attached to that URL. Nothing about the published page
changes. What changes is the agent payload — the representation an agent receives.

## User Stories

As a **publisher** — a website owner or content manager, not a developer:

1. As a publisher, I want to see what an agent currently reads from my page, so that I can judge whether it represents my content fairly.
2. As a publisher, I want to load any page of my site by its URL, so that I can work on the pages that matter rather than a fixed example.
3. As a publisher, I want the preview to look like my actual page, so that I can recognise what I am editing.
4. As a publisher, I want to click any element in the preview, so that I can work with the page as I see it rather than by reading markup.
5. As a publisher, I want a clear indication of which element is selected, so that I am confident I am editing the right thing.
6. As a publisher, I want to reach the containing section rather than the small piece of text I clicked, so that I can act on a whole region without hunting for it.
7. As a publisher, I want to select several elements at once, so that I can apply one decision to all of them in a single action.
8. As a publisher, I want to see a selected element's tag, text and existing modifications, so that I understand what I am about to change.
9. As a publisher, I want to hide navigation, cookie notices and footer boilerplate from agents, so that an agent reads my content instead of my chrome.
10. As a publisher, I want hiding to genuinely remove content from what the agent receives, so that I am not merely styling it away while the agent still reads it.
11. As a publisher, I want hiding a section to take its contents with it, so that I do not have to hide children one by one.
12. As a publisher, I want to attach an explanation to an element, so that an agent understands what a chart shows, what a form does, or what a section is for.
13. As a publisher, I want my explanation to be text the agent will actually read, so that my effort is not lost in metadata the agent discards.
14. As a publisher, I want an agent to tell my explanation apart from my page's own content, so that it can weigh the two appropriately.
15. As a publisher, I want the content behind a link pulled into the page for agents, so that agents which do not follow links still see what I am pointing at.
16. As a publisher, I want forwarded content placed as its own block, so that a link inside a sentence does not destroy the sentence.
17. As a publisher, I want to be told when a link could not be fetched, so that I do not assume it worked.
18. As a publisher, I want to see every modification I have applied in one list, so that I can review my work without clicking through the page.
19. As a publisher, I want to see on the page itself which elements I have modified, so that I can find my own work at a glance.
20. As a publisher, I want to remove any modification individually, so that I can undo one decision without discarding the rest.
21. As a publisher, I want to see the human page and the agent payload side by side, so that I can watch the effect of a change as I make it.
22. As a publisher, I want to know how much of the payload is my content versus page boilerplate, so that I can tell whether my edits are working.
23. As a publisher, I want to save my configuration, so that my work persists beyond the session.
24. As a publisher, I want my saved configuration applied automatically when I reopen a page, so that I resume where I left off rather than starting blank.
25. As a publisher, I want warning before I navigate away with unsaved changes, so that I do not lose work to a stray refresh.
26. As a publisher, I want my modifications to keep working after my page's markup changes, so that ordinary site edits do not silently undo my work.
27. As a publisher, I want to be told which modifications no longer match anything, so that I can fix or remove them deliberately rather than wondering why they stopped applying.
28. As a publisher, I want to be told when my explanation now sits on content that has changed, so that I can check it still says something true.
29. As a publisher, I want a rebuilt page reported as one problem rather than twenty, so that I understand what actually happened.
30. As a publisher, I want a modification to come back if its element returns, so that a temporary removal does not cost me the work.
31. As a publisher, I want a clear explanation when a page cannot be loaded, so that I know whether the problem is the site, the network, or my input.
32. As a publisher, I want the tool to speak about agents and content rather than HTML and CSS, so that I can use it without being a developer.

As the **agent** consuming the result — not a user of the editor, but the party the output is
written for:

33. As an agent, I want the page as clean text, so that I can read it without parsing layout markup.
34. As an agent, I want hidden elements absent from what I receive, so that I am not misled by content the publisher considers irrelevant.
35. As an agent, I want publisher explanations adjacent to the elements they describe, so that I associate each with the right content.
36. As an agent, I want publisher explanations distinguishable from the page's own words, so that I can weigh them appropriately.
37. As an agent, I want linked content inlined, so that I can answer questions about it without making further requests.

## Implementation Decisions

**The system is a transform.** A target URL plus a configuration produces an agent payload. The
editor is the surface for authoring the configuration; the transform is the product.

**Modifications are data applied at render time.** A configuration never stores a modified copy
of the target page. Every payload is built by re-fetching the page and re-applying the
configuration, so nothing can be served stale and each modification degrades individually when
the page changes. (ADR-0001)

**Hiding removes content from the payload**, along with the element's descendants — not
`display:none`, `aria-hidden`, or a CSS class, all of which leave the text readable to an agent
consuming raw HTML. This is what forces a server-side render path. (ADR-0002)

**Configuration shape.** One document per normalized URL: a flat, order-independent list of
type-tagged modifications, each carrying a stable client-generated id, a locator, and a typed
value. At most one modification per (locator, type) — applying again upserts. Nothing derived
is stored: no cached markup, no resolved link content.

```jsonc
{
  "version": 1,
  "url": "…",              // original, for display
  "updatedAt": "…",
  "modifications": [
    { "id": "…", "type": "hide",        "target": { … } },
    { "id": "…", "type": "context",     "target": { … }, "value": { "text": "…" } },
    { "id": "…", "type": "forwardLink", "target": { … }, "value": { "href": "…", "maxChars": … } }
  ]
}
```

**URL normalization** determines configuration identity: lowercase scheme and host, drop `www.`
and the fragment, strip tracking parameters, sort the remainder, drop a trailing slash. The
original URL is retained for display. Non-tracking parameters are significant — a product id
denotes a different page.

**A modification is attached to a locator, not an element.** A locator holds a structural path,
a content fingerprint, and a human-readable text hint, and is resolved against the page on
every render in four graded tiers: exact, drift, re-anchor, stale. A bare CSS selector was
rejected because it has a single failure mode — it matches or it does not — so any page edit
silently drops modifications. (ADR-0003)

**Drift resolves differently per modification type.** Hiding applies unchanged, because the
intent was structural. Link forwarding applies against the anchor's current href, because the
intent was "follow this link". A context note applies but raises **needs review**, because text
written about since-rewritten content can actively mislead an agent — worse than being absent.
Needs-review is editorial state and never appears in the agent payload.

**Ambiguous re-anchoring resolves to stale.** Where a fingerprint matches several candidates,
prefer the smallest path distance; if still tied, go stale rather than guess. A wrong guess
hides or annotates the wrong content invisibly, which is the worst failure this system can
produce.

**A rebuilt page is one event, not many.** Above a threshold of failed locators, the interface
reports a single page-level message rather than a list of individual failures.

**Stale modifications are retained and revive.** They are skipped at render, surfaced to the
publisher, and re-attach if their element returns in a later fetch.

**Shadowing.** A modification whose locator resolves inside a hidden subtree is retained,
unapplied, and shown as hidden-by-parent; it returns intact when the ancestor is unhidden.
Deleting it would lose work the publisher cannot see they lost.

**Context notes are delivered as real text** adjacent to their element, in both payload formats
— not as an attribute alone, an HTML comment, or an ARIA property, all of which are lost by
agents that flatten a page to text. Provenance attributes are layered alongside so a consumer
can distinguish publisher annotation from original content. (ADR-0004)

**Link forwarding happens server-side at render time**, not at save time: validate the href
against the SSRF guard, fetch under a timeout and size cap, extract main content, and place it
as a block after the anchor's nearest block-level ancestor so a mid-sentence link does not
destroy its sentence. Bounded by: depth one, no recursive forwarding, self and cycle links
skipped, duplicate hrefs deduplicated, a total character budget per render, typed placeholders
for non-HTML content types, and a visible error node on failure rather than a silent omission.
Destinations are cached briefly, so a page with twenty forwarded links does not mean twenty
cold fetches per preview.

**Two payload formats** are produced from the same modified tree: Markdown, emitted as an
ordered array of blocks each carrying its element handle, and cleaned semantic HTML. Markdown
is what most agents consume and is the default view; emitting it as blocks rather than one
string is what makes cross-highlighting a class change rather than character-offset arithmetic.

**Modules.** A web application (React, TypeScript), a server (NestJS on its default platform),
and a shared schema package holding the one definition of the data model as validators plus
types, consumed by both. Domain logic — locator resolution, the transforms, fetching,
sanitizing — is written as plain classes with no framework decorators, so the framework stays
at the HTTP edge.

**API.** Three endpoints: fetch and prepare a target page for preview; render a configuration
into an agent payload with diagnostics; save and load a configuration.

**Preview mechanism.** Sanitized page markup rendered into a sandboxed iframe that never
combines script execution with same-origin access, with an injected overlay translating clicks
into element selection across a message boundary. A base URL is injected so the site's own
stylesheets and images resolve. Rendering a parsed tree with framework components, Shadow DOM,
and browser-side fetching were all rejected. (ADR-0005)

**Storage.** One JSON document per normalized URL in SQLite, behind a repository interface. The
configuration is always read and written whole, so document-shaped storage is correct rather
than lazy, and no server process is required of whoever runs this. (ADR-0007)

**Security.** Scheme allowlist; DNS resolution followed by blocks on private, loopback,
link-local and cloud metadata ranges; every redirect hop re-checked and the chain capped;
sanitization of fetched markup before it reaches the preview; publisher text escaped on output;
timeouts, response size caps and a per-render fetch budget. Requests carry an honest,
identifiable user agent, overridable by configuration.

**Interface.** Two panels. The preview has three states — the human page, the agent payload
(the default on first load, so the publisher's first sight is what an agent reads today), and a
side-by-side comparison where selecting an element highlights its counterpart and hiding it
makes it visibly disappear. An inspector reports the selected element's tag, text and
modifications, each removable. A global list carries review and removal, and is where stale,
shadowed, drifted and needs-review modifications surface. An always-on overlay marks modified
elements on the page. Ancestor navigation lets a publisher climb from the text they clicked to
the region they meant. Multi-element selection applies one decision to many: actions behave as
commands rather than toggles, so a mixed selection needs no tri-state controls, and removal
stays in the single-element inspector. Payload size is reported as a split — boilerplate
removed against context added — never as a net figure, since forwarding legitimately grows the
payload. Failures render as typed, human explanations inside the preview pane. All copy
addresses publishers, never developers.

## Testing Decisions

A good test here states a rule of the product, not the shape of the code behind it. It should
survive any internal reorganisation of the resolver, the emitters, or the sanitizer.

**One seam: the render endpoint** — a target page plus a configuration in, an agent payload and
diagnostics out. Every product rule is observable there, asserted against fixture pages: a
hidden element and its subtree are absent; a context note is present as readable text adjacent
to its element; forwarded content appears as a block after the anchor's containing block; a
modification beneath a hidden parent is shadowed and returns when the parent is unhidden; a
moved element re-anchors by fingerprint; a vanished element goes stale and is retained; a
context note whose element changed is applied and flagged needs review while a hide on the same
drift is applied silently; an ambiguous fingerprint with no nearest candidate resolves to stale
rather than an arbitrary pick; a stale modification revives when its element returns. (ADR-0006)

**Two exceptions tested directly**, because their cases are impractical to provoke through an
endpoint: the SSRF guard (redirect into a private range, IPv6 loopback, cloud metadata address)
and URL normalization (a pure function, best expressed as a table of inputs to expected keys).
The shared schema gets round-trip tests.

**Deliberately untested:** view components, and no end-to-end browser suite. The behaviour worth
protecting lives in the transform, and the interface is thin over it. Stating this is part of
the specification rather than an omission.

Development is test-first: write the failing test, confirm it fails for the right reason, then
implement the minimum that passes.

## Out of Scope

- **JavaScript-rendered pages.** Scripts are never executed, so a client-rendered application
  yields an empty document with nothing to annotate. The limitation is stated rather than
  half-solved; headless rendering is the upgrade path.
- **robots.txt enforcement.** Requests identify themselves honestly, but robots directives are
  not read.
- **Recursive link forwarding** beyond one level.
- **Authentication, multiple users, multiple tenants.**
- **Serving payloads to live agent traffic.** The render endpoint returns exactly the
  representation an agent would receive — a hidden element is absent from it — but the
  production delivery path that would place it in front of real crawlers is not built.
- **Applying an existing modification to elements found later** (a format-painter interaction),
  and **selecting every structurally similar element at once**. Both were considered; multi-
  element selection covers the common case.
- **Page-level or domain-level rules** spanning many URLs.
- **Token counting.** Payload size is reported in words.

## Further Notes

This is a take-home exercise, judged on product thinking, data schema design, code quality,
edge case handling, and whether the result feels like a real tool rather than a scaffolded
proof of concept. Deliverables are the source, a README covering setup, architecture and
limitations, and a short screen recording.

Two constraints shape the plan. First, anyone evaluating this must be able to run it with an
install and a single command — no containers, no required environment variables — so demo pages
are committed as fixtures and every optional integration degrades to recorded responses.
Second, the work is ordered as vertical slices, each demonstrable on its own: foundation, then
seeing what an agent reads, then hiding one element end to end, then all three modification
types, then save and restore, then the proof layer, then shipping. Everything in the proof
layer is a cut candidate in a fixed order; nothing before it is.

Candidate demo pages were verified against an honest user agent: Wikipedia, BBC News and
Stripe's pricing page serve full server-rendered content; a retailer product page returns 403,
which is what the user-agent override exists for; and Vercel's pricing page returns over a
megabyte of markup containing almost no readable text — a useful illustration of the problem
this tool addresses, and unusable as an editing target.

The delivery plan, the assignment's own text, and a clause-by-clause coverage table are kept in
`BRIEF.md`, the working document this specification was synthesized from.
