# AX Page Editor — Specification

> The assignment states: *"We intentionally left things vague. That's the point. We're not
> testing whether you can follow a spec — we're testing whether you can write one, then
> execute it."* This is that spec. It was written before implementation began, from the
> design review recorded in [`docs/DECISIONS.md`](docs/DECISIONS.md).

---

## 1. Problem

Publishers are increasingly read by AI agents rather than people. Agents do not see design —
they consume text, they do not execute JavaScript, and they largely do not follow links. A
page tuned for human visitors is therefore often illegible to the agents that now mediate a
growing share of its audience, and publishers have no way to control what those agents see.

## 2. Product definition

A visual, CMS-style editor for publishers — not developers — that lets a user load a webpage,
click any element, and control how that element is presented to AI agents.

**The system is a transform:**

```
(source URL, modification set) -> agent-facing representation of the page
```

The editor is the authoring surface for the modification set. The transform is the product.

### 2.1 Design principles

1. **Modifications are declarative data applied at render time.** The system never mutates or
   stores a copy of the source page. The page changes underneath us; the modification set must
   degrade gracefully when it does.
2. **Hiding must be true at the byte level.** `display:none`, `aria-hidden`, and CSS classes
   do not hide anything from an agent reading raw HTML. Hidden elements are deleted from the
   agent payload.
3. **Publisher annotations must be readable by the agent.** Context lives in the output as real
   parseable text, never solely as an attribute, comment, or ARIA property.
4. **Provenance is preserved.** A downstream consumer can distinguish publisher-authored
   annotation from original page content.

## 3. User Stories

As a **publisher** (a website owner or content manager, not a developer):

1. As a publisher, I want to see what an AI agent currently reads from my page, so that I can judge whether it represents my content fairly.
2. As a publisher, I want to load any page of my site by URL, so that I can work on the pages that matter rather than a fixed example.
3. As a publisher, I want to click any element in a visual preview of my page, so that I can work with the page as I see it rather than by reading its markup.
4. As a publisher, I want a clear indication of which element I have selected, so that I am confident I am editing the right thing.
5. As a publisher, I want to select a containing section rather than the small piece of text I clicked, so that I can act on a whole region without hunting for it.
6. As a publisher, I want to see an element's tag, text, and existing modifications when I select it, so that I understand what I am about to change.
7. As a publisher, I want to hide navigation, cookie notices, and footer boilerplate from agents, so that the agent reads my content instead of my chrome.
8. As a publisher, I want hiding to genuinely remove content from what the agent receives, so that I am not merely styling it away while the agent still reads it.
9. As a publisher, I want to attach an explanation to an element, so that an agent understands what a chart shows, what a form does, or what a section is for.
10. As a publisher, I want my explanation to be text the agent will actually read, so that my effort is not lost in metadata the agent discards.
11. As a publisher, I want an agent to be able to tell my annotation apart from my page's original content, so that it can weigh the two appropriately.
12. As a publisher, I want the content behind a link to be pulled into the page for agents, so that agents that do not follow links still see what I am pointing at.
13. As a publisher, I want forwarded content placed as its own block, so that a link inside a sentence does not destroy the sentence.
14. As a publisher, I want to see every modification I have applied in one list, so that I can review my work without clicking through the page.
15. As a publisher, I want to see on the page itself which elements I have modified, so that I can find my own work at a glance.
16. As a publisher, I want to remove any modification individually, so that I can undo one decision without discarding the rest.
17. As a publisher, I want to compare the human page and the agent view side by side, so that I can see the effect of a change as I make it.
18. As a publisher, I want to save my configuration, so that my work persists beyond the session.
19. As a publisher, I want my saved configuration applied automatically when I reopen a page, so that I resume where I left off rather than starting blank.
20. As a publisher, I want to be warned before I navigate away with unsaved changes, so that I do not lose work to a stray refresh.
21. As a publisher, I want my modifications to keep working after my page's markup changes, so that ordinary site edits do not silently undo my work.
22. As a publisher, I want to be told which modifications no longer match anything, so that I can fix or remove them deliberately rather than wondering why they stopped applying.
23. As a publisher, I want a clear explanation when a page cannot be loaded, so that I know whether the problem is the site, the network, or my input.
24. As a publisher, I want the tool to speak in terms of agents and content rather than HTML and CSS, so that I can use it without being a developer.

As the **agent** consuming the result — not a user of the editor, but the party the output is written for:

25. As an agent, I want the page as clean text, so that I can read it without parsing layout markup.
26. As an agent, I want hidden elements absent from what I receive, so that I am not misled by content the publisher considers irrelevant.
27. As an agent, I want publisher context adjacent to the element it describes, so that I can associate the explanation with the right content.
28. As an agent, I want linked content inlined, so that I can answer questions about it without making further requests.

## 4. Scope

### 4.1 In scope

- Loading any server-rendered public webpage by URL.
- Click-to-select any element in a visual preview.
- Three modification types: **hide from agents**, **add context**, **context-forward a link**.
- Reviewing and removing applied modifications.
- Persisting and restoring a configuration per page.
- Rendering the agent-facing representation in both Markdown and cleaned HTML.

### 4.2 Explicitly out of scope

- **JavaScript-rendered pages.** The pipeline never executes scripts, so a client-rendered SPA
  yields an empty DOM with nothing to annotate. Server-side headless rendering is the upgrade
  path, and is named in §11.
- robots.txt enforcement.
- Recursive link forwarding beyond depth 1.
- Authentication, multi-user, multi-tenancy.
- Serving the modified page to real agent traffic (see §11).

## 5. Data model

One configuration document per **normalized URL**. Flat, order-independent, type-tagged.

```jsonc
{
  "version": 1,
  "url": "https://example.com/pricing",   // original, for display
  "updatedAt": "…",
  "modifications": [
    { "id": "m_01", "type": "hide",    "target": { … } },
    { "id": "m_02", "type": "context", "target": { … },
      "value": { "text": "Enterprise tier; contact sales." } },
    { "id": "m_03", "type": "forwardLink", "target": { … },
      "value": { "href": "…", "maxChars": 4000 } }
  ]
}
```

**Constraints.** Stable client-generated ids. One modification per (target, type) — the UI
upserts rather than appending duplicates. **Nothing derived is stored**: no cached HTML, no
resolved link content, so the document stays readable, diffable, and portable across page
versions.

**URL normalization** — lowercase scheme and host, strip `www.`, drop the fragment, strip
tracking parameters, sort remaining parameters, drop a trailing slash. Non-tracking parameters
are preserved: `?product=123` is a different page.

### 5.1 Element identity

The hardest problem in the system. A modification points at "that element", and the pointer
must survive re-fetching, DOM churn, injected nodes, and reordering.

```jsonc
"target": {
  "path":        "main>article>div:nth-of-type(2)>p:nth-of-type(1)",
  "fingerprint": "sha1(tag + normalized text + href/src)",
  "textHint":    "Book a demo"
}
```

Resolution is **graded**:

| Tier | Condition | Behaviour |
|---|---|---|
| Exact | path resolves, fingerprint matches | apply |
| Drift | path resolves, fingerprint differs | apply, record drift, warn in UI |
| Re-anchor | path fails, fingerprint found elsewhere | apply at new location, record move |
| Stale | neither resolves | skip at render, retain in config, surface in UI |

`data-ax-id` is a positional in-session handle used only to wire preview to inspector. It is
never persisted.

## 6. Behaviour of each modification type

### 6.1 Hide from agents
The element and its **entire subtree** are removed from the agent payload. Not styled away —
removed.

### 6.2 Add context
Publisher-authored text is emitted as a **real text node adjacent to the element**: in HTML as
`<span data-ax-context>`, in Markdown as an adjacent note. Rejected alternatives: a `data-*`
attribute alone, an HTML comment, `aria-label` — agents that strip attributes or comments
would lose it, defeating the purpose. The `data-ax-context` marker is layered on for
provenance.

### 6.3 Context-forward a link
At render time, the server validates the href, fetches it, extracts the main content, and
inlines it. **Always as a block** appended after the nearest block-level ancestor, never inline
— an anchor mid-sentence must not have thousands of words injected into the sentence. The
original anchor text remains.

Bounded by: depth 1, ~5s timeout, ~1MB per fetch, ~20k characters total per render, deduped
hrefs, skipped self/cycle links, typed placeholders for non-HTML content, and a visible error
node on failure rather than a silent drop.

### 6.4 Interaction rules
Hiding a parent **shadows** descendant modifications: they are retained in the configuration,
not rendered, shown greyed as "hidden by parent", and restored when the parent is unhidden.
`context` and `forwardLink` may coexist on one element.

## 7. Interface

Two panels: preview and modifications editor.

- **Preview** has three states — **Human view** (the styled page, clickable), **Agent view**
  (the payload, Markdown by default with an HTML tab), and **Compare mode** (both side by side,
  cross-highlighted, inspector collapsed).
- **Agent view is the default on first load** — the user's first impression is what an agent
  currently sees.
- **Inspector** shows the selected element's tag, text, resolved locator, and its modifications,
  each individually removable.
- **Modifications list** provides global review and removal, and is where stale and shadowed
  modifications surface.
- **Diff overlay** marks modified elements on the page: hidden, annotated, forwarded, with a
  legend.
- Copy is written for publishers: "Hide from AI agents", never "set `display:none`".

## 8. Architecture

```
Browser (React + TS)                 Server (NestJS)
  POST /api/page {url}      ──────>  SSRF guard → fetch (honest UA) → sanitize
                                     → inject <base> → assign data-ax-id
            <────── {html, docId}
  render into <iframe sandbox srcdoc> + selection overlay
  click → postMessage → inspector

  POST /api/render {url, mods} ───>  re-apply pipeline → resolve locators
                                     → apply modifications → forward links (cached)
            <────── {markdownBlocks[], html, diagnostics}

  POST /api/config {url, mods} ───>  SQLite repository
```

**Stack.** React + TypeScript + Vite + Tailwind · NestJS on the default Express platform ·
SQLite behind a repository interface · zod in `packages/schema` as the single definition of
the data model, shared by both apps.

Domain logic — locator, transforms, fetcher, sanitizer — is written as plain classes with no
framework decorators, so the framework stays confined to the HTTP edge and the logic
unit-tests without a testing module.

## 9. Security

- **SSRF**: scheme allowlist; DNS resolution followed by blocks on private, loopback,
  link-local and cloud metadata ranges; every redirect hop re-checked; redirect count capped.
- **Sanitization** before rendering: `<script>`, `on*` handlers, `javascript:` URLs, form
  actions, nested iframes removed.
- **Iframe sandbox** that never combines `allow-scripts` with `allow-same-origin`.
- **Output escaping** of all publisher-supplied text.
- **Budgets**: request timeouts, response size caps, per-render fetch limits.

## 10. Testing decisions

Development is test-first: write the failing test, confirm it fails for the right reason,
implement the minimum that passes. That settles *when* tests are written. This section settles
**where they attach**, which is the decision that determines whether the suite survives
refactoring.

### 10.1 The seam

**One seam: `POST /api/render`** — URL plus modification set in, agent payload out.

Almost every rule in this specification is observable there, so tests are written as statements
about product behaviour rather than about internal structure:

- a hidden element does not appear in the payload, and neither does its subtree
- context appears as readable text adjacent to its element
- a forwarded link's content appears as a block after the anchor's containing block
- a modification beneath a hidden parent is shadowed, and returns when the parent is unhidden
- an element whose path moved is re-anchored by fingerprint
- an element that no longer exists is reported stale, and the modification is retained

Each maps to an acceptance criterion in §12. None depends on how the resolver, emitter, or
sanitizer is internally arranged, so reshaping any of them does not break a single test.

The alternative — a test per class, following whatever is in front of you — produces a suite
coupled to structure, where the first refactor turns dozens of tests red without any behaviour
having changed. On a short clock those tests get deleted rather than repaired, which is worse
than not having written them.

### 10.2 Tested directly, and why

- **SSRF guard** — security-critical, and its cases (redirect into a private range, IPv6
  loopback, cloud metadata address) are awkward to provoke through the endpoint. Unit-tested
  against an explicit table.
- **URL normalization** — a pure function; a table of inputs to expected keys is the clearest
  possible expression of it.

### 10.3 Not tested, deliberately

React components, and no end-to-end browser suite. The behaviour worth protecting lives in the
transform, which is covered at the seam; the UI is thin over it. This is a scoping decision
rather than an oversight, and stating it is part of the specification.

Server tests run on Jest (the framework default, to avoid a tooling detour); web tests on
vitest.

## 11. Known limitations and future work

| Limitation | Future direction |
|---|---|
| No JavaScript execution; SPAs unusable | Headless rendering (Playwright) for client-rendered pages |
| robots.txt not enforced | Honor robots and `Crawl-delay` before any production crawl |
| Link forwarding capped at depth 1 | Configurable depth with cycle detection and a global budget |
| Configurations are not served to real agents | `GET /ax/render` with User-Agent content negotiation; `llms.txt` export |
| Single-node SQLite | Postgres JSONB as system of record; compiled configs pushed to edge KV for the agent read path, which is cacheable and rarely changes |
| No page-level or domain-level rules | Rules applied by selector across a domain — publishers have thousands of pages, not one |
| No agent-readability guidance | A linter scoring the page for agent legibility (ambiguous link text, unlabelled inputs, missing alt text, no heading hierarchy) with one-click fixes |

## 12. Acceptance criteria

1. `npm install && npm run dev` from a clean clone produces a working app — no Docker, no
   required environment variables.
2. A user can load a URL, click any element, and see its tag, text, and modifications.
3. All three modification types apply and are visible in the agent payload.
4. A hidden element is absent from the agent payload — verifiable by reading the raw output.
5. Context text appears in the agent payload as readable text.
6. A forwarded link's destination content appears inline in the agent payload.
7. Modifications can be reviewed and individually removed.
8. A configuration survives save, reload, and re-fetch of a changed source page, with drifted
   modifications re-anchored and unresolvable ones surfaced as stale rather than silently lost.
9. A failed page load renders a specific, human explanation inside the preview.
