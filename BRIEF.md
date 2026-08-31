# AX Page Editor — Specification

Single source of truth for this build: the problem, the solution, the decisions behind it, and
the delivery plan. Every non-obvious call is recorded here with its reasoning, so the README
points at this document rather than re-arguing it.

Repo: `nimrodev/ax-page-editor` · Assignment: Axioma R&D full-stack take-home.

---

## 1. Problem
Publishers are increasingly read by AI agents rather than by people. Agents do not see design.
They consume text, they do not execute JavaScript, and they largely do not follow links — so a
page carefully tuned for human visitors is often close to illegible to the software now
mediating a growing share of its audience. Navigation, cookie notices and footer boilerplate
arrive as content. A chart is a blank. A form is unexplained. A link that carries the actual
answer is never followed.

Publishers have no way to see this, and no way to change it. They can edit their page for
humans; they have no control over what an agent takes away from it.

## 2. Solution
A visual editor where a publisher loads their own page, sees what an agent currently reads from
it, and corrects that — by hiding what is noise, explaining what is ambiguous, and pulling in
what sits behind a link. They work by clicking elements on a preview of their page, exactly as
they would in a page builder, and save the result as a configuration attached to that URL.

Nothing about the published page changes. What changes is the representation an agent receives.

## 3. User stories
As a **publisher** — a website owner or content manager, not a developer:

1. As a publisher, I want to see what an AI agent currently reads from my page, so that I can judge whether it represents my content fairly.
2. As a publisher, I want to load any page of my site by URL, so that I can work on the pages that matter rather than a fixed example.
3. As a publisher, I want to click any element in a visual preview of my page, so that I can work with the page as I see it rather than by reading markup.
4. As a publisher, I want a clear indication of which element I have selected, so that I am confident I am editing the right thing.
5. As a publisher, I want to reach a containing section rather than the small piece of text I clicked, so that I can act on a whole region without hunting for it.
6. As a publisher, I want to select several elements at once, so that I can apply the same decision to all of them in one action.
7. As a publisher, I want to see an element's tag, text, and existing modifications when I select it, so that I understand what I am about to change.
8. As a publisher, I want to hide navigation, cookie notices and footer boilerplate from agents, so that an agent reads my content instead of my chrome.
9. As a publisher, I want hiding to genuinely remove content from what the agent receives, so that I am not merely styling it away while the agent still reads it.
10. As a publisher, I want to attach an explanation to an element, so that an agent understands what a chart shows, what a form does, or what a section is for.
11. As a publisher, I want my explanation to be text the agent will actually read, so that my effort is not lost in metadata the agent discards.
12. As a publisher, I want an agent to tell my annotation apart from my page's original content, so that it can weigh the two appropriately.
13. As a publisher, I want the content behind a link pulled into the page for agents, so that agents which do not follow links still see what I am pointing at.
14. As a publisher, I want forwarded content placed as its own block, so that a link inside a sentence does not destroy the sentence.
15. As a publisher, I want to see every modification I have applied in one list, so that I can review my work without clicking through the page.
16. As a publisher, I want to see on the page itself which elements I have modified, so that I can find my own work at a glance.
17. As a publisher, I want to remove any modification individually, so that I can undo one decision without discarding the rest.
18. As a publisher, I want to compare the human page and the agent view side by side, so that I can see the effect of a change as I make it.
19. As a publisher, I want to save my configuration, so that my work persists beyond the session.
20. As a publisher, I want my saved configuration applied automatically when I reopen a page, so that I resume where I left off rather than starting blank.
21. As a publisher, I want warning before I navigate away with unsaved changes, so that I do not lose work to a stray refresh.
22. As a publisher, I want my modifications to keep working after my page's markup changes, so that ordinary site edits do not silently undo my work.
23. As a publisher, I want to be told which modifications no longer match anything, so that I can fix or remove them deliberately rather than wondering why they stopped applying.
24. As a publisher, I want a clear explanation when a page cannot be loaded, so that I know whether the problem is the site, the network, or my input.
25. As a publisher, I want the tool to speak in terms of agents and content rather than HTML and CSS, so that I can use it without being a developer.

As the **agent** consuming the result — not a user of the editor, but the party the output is
written for:

26. As an agent, I want the page as clean text, so that I can read it without parsing layout markup.
27. As an agent, I want hidden elements absent from what I receive, so that I am not misled by content the publisher considers irrelevant.
28. As an agent, I want publisher context adjacent to the element it describes, so that I can associate the explanation with the right content.
29. As an agent, I want linked content inlined, so that I can answer questions about it without making further requests.

## 4. Framing and data model

The editor is the visible surface; the deliverable is a **transform**:

```
(target URL, configuration) -> agent payload
```

Two consequences drive everything:

1. **Modifications are declarative data applied at render time** — never mutations of a stored
   copy of the page. The target page changes underneath us, so the configuration must
   degrade gracefully when it does.
2. **Hiding must be true at the byte level**, which forces a server-side render path.

**Config document** — one per normalized URL, flat, order-independent, type-tagged:

```jsonc
{
  "version": 1,
  "url": "https://example.com/pricing",     // original, for display
  "updatedAt": "…",
  "modifications": [
    { "id": "m_01", "type": "hide",        "target": { … } },
    { "id": "m_02", "type": "context",     "target": { … }, "value": { "text": "…" } },
    { "id": "m_03", "type": "forwardLink", "target": { … }, "value": { "href": "…", "maxChars": 4000 } }
  ]
}
```

Stable client-generated ids. One modification per (target, type) — the UI upserts rather than
appending duplicates. **Nothing derived is stored** — no cached HTML, no resolved link content
— so the document stays readable, diffable, and portable across page versions. Keying
modifications *by* selector was rejected: compact, but it makes list/remove/diff awkward and
collapses when a selector re-anchors.

**URL normalization** — lowercase scheme and host, strip `www.`, drop the fragment, strip
tracking parameters (`utm_*`, `fbclid`, `gclid`), sort the rest, drop a trailing slash. The
original URL is retained for display. Non-tracking parameters are preserved: `?product=123` is
a different page.

### 4.1 Element identity — the hard problem, solved first

A modification points at "that element", and the pointer must survive re-fetching, DOM churn,
injected nodes, and reordering.

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
| Re-anchor | path fails, fingerprint found elsewhere | apply at the new location, record the move |
| Stale | neither resolves | skip at render, **retain in config**, surface in UI |

`data-ax-id` is a positional, in-session handle wiring preview to inspector. It is never
persisted, because it is meaningless across re-fetches.

**A modification is attached to a locator, not to an element.** That is why a stale
modification is coherent: the element is gone, the modification is not.

#### 4.1.1 Drift behaves differently per modification type

Applying drift uniformly is unsafe. Hiding a `<nav>` whose links changed is still correct —
the intent was structural. But a context note reading "Enterprise tier — contact sales",
attached to a paragraph the publisher has since rewritten, now **actively misleads the agent**,
which is worse than being absent.

| Type | On drift |
|---|---|
| `hide` | Apply. The intent is structural and survives a content change. |
| `forwardLink` | Apply, reading the anchor's **current** href — the publisher's intent was "follow this link", not "follow that URL". |
| `context` | Apply, but raise a distinct **needs-review** state: the text was written about content that has since changed. Only the publisher can judge whether it still holds. |

`needs-review` is deliberately *not* signalled in the agent payload. It is internal editorial
state; leaking it would put our uncertainty in front of an agent.

#### 4.1.2 A redesign is not eighteen drifts

If a large share of locators fail on one re-fetch, the page was rebuilt, and reporting each
failure separately is useless noise. Above a threshold (half the configuration), the UI reports
it once at page level — *"This page has changed substantially. 18 of 25 modifications could not
be placed."* — with the individual detail available underneath.

#### 4.1.3 Ambiguous re-anchoring resolves to stale, never to a guess

A publisher duplicates a section and one fingerprint now matches three elements. Prefer the
candidate at the smallest path distance from the original; **if still tied, mark stale rather
than choose**. A wrong guess silently hides or annotates the wrong content, which is the worst
failure this system can produce — it is invisible to the publisher and misleading to the agent.

#### 4.1.4 Stale modifications revive

Because stale modifications are retained rather than deleted, an element that disappears in one
edit and returns in a later one re-attaches on the next re-fetch. Nothing is lost to a
temporary removal.

---

## 5. The three modification types

### 5.1 Hide from agents
Element and entire subtree removed from the agent payload. A hidden `<section>` whose children
survived would be a plain bug.

### 5.2 Add context
A real text node adjacent to the element, in both output formats, with `data-ax-context` as a
provenance marker. Publisher-supplied text is escaped on output.

### 5.3 Context-forward a link
Server-side at render time, not save time: SSRF-check the href, fetch with ~5s timeout and
~1MB cap, extract main content, strip nav and footer, truncate at a block boundary with the
truncation marked. Cached by URL with a short TTL — twenty forwarded links must not mean twenty
cold fetches per preview.

Bounded and defended: depth 1 (no recursive forwarding) · self and cycle links skipped ·
duplicate hrefs deduped · ~20k characters total per render · non-HTML content types (PDF,
image) render a typed placeholder · a failed fetch renders a visible error node rather than
disappearing silently.

### 5.4 Interaction rules
Hiding a parent **shadows** descendant modifications: retained in the config, not rendered,
shown greyed as "hidden by parent", restored when the parent is unhidden. Silently deleting
them would lose work the user cannot see they lost. `context` and `forwardLink` may coexist on
one anchor.

---

## 6. Architecture

```
Browser (React + TS)                 Server (NestJS)
  POST /api/page   {url}    ──────>  SSRF guard → fetch (honest UA) → sanitize
                                     → inject <base> → assign data-ax-id
            <────── {html}
  render into <iframe sandbox srcdoc> + selection overlay
  click → postMessage → inspector

  POST /api/render {url, mods} ───>  re-apply pipeline → resolve locators
                                     → apply modifications → forward links (cached)
            <────── {markdownBlocks[], html, diagnostics}

  POST /api/config {url, mods} ───>  SQLite repository
```

**Stack.** npm workspaces — `apps/web` (React + TypeScript + Vite + Tailwind), `apps/server`
(NestJS on the default Express platform), `packages/schema` (zod + types, the one definition of
the data model). Server libraries: jsdom, Readability, sanitize-html, Turndown.

**Storage.** SQLite, one table, one JSON document per normalized URL, behind a repository
interface. The config is always read and written whole, so document-shaped storage is correct;
SQLite gives atomic writes and safe reads with zero setup from a reviewer. Postgres JSONB is the
production answer once there are tenants and concurrent editors, with compiled configs pushed
to edge KV for the agent read path — the repository interface is what makes that a one-file
change rather than a claim.

**Preview.** A sandboxed `<iframe srcdoc>`, never combining `allow-scripts` with
`allow-same-origin`. Chosen over rendering a parsed JSON tree with React (loses the page's real
appearance, and the assignment invokes Elementor/Webflow), Shadow DOM (weaker isolation, host
CSS conflicts), and client-side fetching (dies on CORS, and removes the server-side link
following F3 requires). A `<base href>` is injected so the site's own CSS and images resolve —
one line instead of rewriting every URL.

**Nest guardrails.** One feature module, thin controllers, a small zod validation pipe instead
of class-validator DTOs so `packages/schema` stays the single definition, the SSRF check as a
guard, the forwarded-link cache as an interceptor. Domain logic — locator, transforms, fetcher,
sanitizer — is written as plain classes with no decorators, so the framework stays at the HTTP
edge and the logic tests without a testing module.

---

## 7. Interface and product decisions

- **Preview states.** Human view (styled, clickable) · **Agent view, the default on first
  load**, with the banner "This is what an AI agent sees today" · Compare mode.
- **Compare mode** splits human-left / agent-right and collapses the inspector to a strip. Not
  the default: three full columns leaves a real page render too cramped to author against.
  Selecting an element on the left highlights its block on the right; hiding it makes it
  visibly disappear. Clicking stays left-only — the agent pane is read-only output. A hidden
  element leaves a thin strikethrough placeholder while selected, so removal is distinguishable
  from a bug.
- **Inspector** — tag, truncated text, resolved locator, per-element modifications, each
  removable.
- **Modifications list** — global review and removal; where stale, shadowed, drifted and
  needs-review modifications surface, each rendered distinctly. A context note whose element
  changed underneath it is the one state that asks the publisher to do something, so it reads
  loudest.
- **Diff overlay**, always on in Human view — dashed red outline hidden, blue badge context,
  green badge forwarded, plus a legend. Without it a publisher who annotated twelve elements
  cannot see their own work on the page.
- **Breadcrumb ancestors + arrow-key parent/child navigation.** Clicking a `<span>` when you
  meant the `<section>` is the core usability problem of this class of editor.
- **Multi-element selection.** The assignment says "a click on selected element/s", so
  selecting several and acting on them together is supported. Plain click selects one;
  cmd/ctrl-click adds or removes. Two decisions keep it cheap:
  - **Actions are commands, not toggles.** Applying "Hide from AI agents" to a selection where
    some elements are already hidden hides the rest and no-ops on those — so there is no
    mixed-state rendering and no tri-state controls, which is where a naive multi-select spends
    most of its cost.
  - **Removal is not offered in multi-select.** Batch removal ("which modification, from which
    subset?") is fiddly for no gain; removal stays in the modifications list and the
    single-element inspector, where it already works.

  With more than one element selected the inspector becomes a compact bar — "5 elements
  selected" plus the applicable actions, with forward-link disabled unless every selection is
  an `<a>`. Applying creates one modification per element, each with its own locator; the
  schema is unchanged, since it is already a flat list. If a selected element is an ancestor of
  another, the descendant is skipped on hide — the ancestor's subtree already covers it, and
  storing it would create a modification that is immediately shadowed.

  **The selection persists after applying**, because the common flow is hide-then-annotate on
  the same group and clearing would force a re-selection you just made; Escape or a plain click
  clears it. For `context`, one text field applies the same text to every selected element —
  each stored as its own modification, so they remain individually editable and removable
  afterwards. Five editors in one panel would be unusable, and identical text is the real use
  case ("this is a pricing tier").
- **"Test with an agent" panel** — sends the before and after payloads to an LLM with three
  fixed questions ("What is this page about? What action does it want the visitor to take? What
  would you tell someone asking about it?") plus a free-text box, and shows the answers side by
  side. Fixed prompts keep the comparison rigorous: same question, same model, only the
  representation differs. Server-side, cached by hash(question + payload), shipping with
  committed fixture responses so it works with **no API key**; live when `ANTHROPIC_API_KEY` is
  set.
- **Payload size** as a split, never a net: `−4,200 noise · +900 context · 3,100 total`. `hide`
  shrinks the payload while `context` and `forwardLink` grow it, so a single "reduction" figure
  would show an increase the moment a link is forwarded. Word count, not tokens — token
  counting is not in the assignment's requirements, so it is built last and cut first.
- **Typed failure states rendered in the preview pane**, never a toast or a blank frame:
  blocked by the site (suggest the UA override), timed out, unsupported content type, blocked
  for security. Publisher language, no status codes.
- **Copy is written for publishers**: "Hide from AI agents", never "set `display:none`".

---

## 8. Security

Scheme allowlist · DNS-resolve then block private, loopback, link-local and cloud metadata
ranges · every redirect hop re-checked and the chain capped · sanitize fetched HTML before it
reaches the iframe (`<script>`, `on*`, `javascript:`, form actions, nested iframes) · sandbox
without combining `allow-scripts` and `allow-same-origin` · escape publisher-supplied text on
output · request timeouts, response size caps, a per-render fetch budget.

An honest `AXEditor/1.0` User-Agent, with an `AX_USER_AGENT` override. Spoofing Chrome is the
wrong instinct to display at a company whose business is the crawler/publisher relationship.
Verified: Wikipedia, BBC News and Stripe /pricing accept it; REI 403s, which is what the
override is for. robots.txt is not enforced — stated in the README's limitations.

---

## 9. Testing

Test-first: write the failing test, confirm it fails for the right reason, implement the
minimum that passes. That settles *when*. The seam settles **where**, which is what decides
whether the suite survives refactoring.

**One seam: `POST /api/render`** — URL plus modifications in, agent payload out. The product
rules are asserted there, against fixture pages, as behaviour rather than structure:

- a hidden element and its subtree are absent from the payload
- context appears as readable text adjacent to its element
- forwarded content appears as a block after the anchor's containing block
- a modification under a hidden parent is shadowed, and returns when the parent is unhidden
- an element whose path moved is re-anchored by fingerprint
- an element that no longer exists is reported stale, and the modification is retained
- a context note whose element's text changed is applied but flagged needs-review, while a
  `hide` on a drifted element is applied silently
- a fingerprint matching several candidates with no nearest match resolves to stale, never to
  an arbitrary pick
- a stale modification re-attaches when its element returns in a later fetch

None of these depend on how the resolver, emitter, or sanitizer is arranged internally, so
reshaping any of them breaks no tests. The alternative — a test per class — produces a suite
coupled to structure that goes red on the first refactor and gets deleted rather than repaired.

**Tested directly:** the SSRF guard (security-critical, and its cases are awkward to provoke
through the endpoint) and URL normalization (a pure function over a table). The zod schema gets
round-trip tests.

**Not tested, deliberately:** React components, and no Playwright e2e. The behaviour worth
protecting lives in the transform. Jest on the server (Nest's default, no tooling detour),
vitest on the web.

---

## 10. Limitations and future work

| Limitation | Future direction |
|---|---|
| No JavaScript execution; client-rendered SPAs yield an empty DOM with nothing to annotate | Headless rendering (Playwright) for JS-rendered pages |
| robots.txt not enforced | Honor robots and `Crawl-delay` before any production crawl |
| Forwarding capped at depth 1 | Configurable depth with cycle detection and a global budget |
| No way to apply an existing modification to elements found later | A format-painter brush: pick up a modification and apply it by clicking, which multi-select cannot do after the fact or across long scroll distances |
| Selection is manual | Select-similar: apply a modification to every structurally matching element at once — the single-page form of the domain rules below |
| Configurations are not served to real agent traffic | `GET /ax/render` with User-Agent content negotiation; `llms.txt` export |
| Single-node SQLite, single user, no auth | Postgres JSONB as system of record; compiled configs at the edge for the agent read path |
| Payloads are computed per request, so nothing can be served stale — but the edge-KV path above would materialise them | That path needs page-change invalidation: re-render on a source change signal, or a short TTL, accepting a stale window |
| No agent-readability guidance | A linter scoring pages for agent legibility — ambiguous link text, unlabelled inputs, missing alt text, no heading hierarchy — with one-click fixes |

---

## 11. Ambiguities decided

The assignment says to decide, document, and move on. These are the calls, each with its reason:

1. **"A click on selected element/s"** — read as supporting multi-element selection, since the
   plural is explicit. Kept affordable by treating actions as commands rather than toggles and
   by leaving removal to the single-element inspector. (§7)
2. **Which pages the tool targets** — server-rendered only. The pipeline never executes
   scripts, so a client-rendered SPA yields an empty DOM with nothing to annotate; the limit is
   stated rather than half-solved. (§10)
3. **Configuration format** — left to me by the assignment: one JSON document per normalized
   URL. (§4)
4. **Where context lives in the output** — real, parseable text adjacent to the element, not
   metadata. This is the call the assignment flags as being judged. (§5.2)
5. **"Preview as it would be served to an agent"** — Agent view is literally that, and is the
   first-load default. Human view exists because you cannot author against raw text. (§7)
6. **Fetch politeness** — honest User-Agent, no robots.txt enforcement, override documented.
   (§8)

---

## 12. Acceptance criteria

1. `npm install && npm run dev` from a clean clone produces a working app — no Docker, no
   required environment variables.
2. Two panels are present, and the selected element carries a clear visual highlight.
3. Any page loads by URL; any element can be clicked; the inspector shows its tag, text, and
   modifications.
4. All three modification types apply and are visible in the agent payload.
5. A hidden element is absent from the agent payload, verifiable by reading the raw output.
6. Context appears in the agent payload as readable text.
7. A forwarded link's destination content appears inline in the agent payload.
8. Modifications can be reviewed and individually removed.
9. A configuration survives save, reload, and re-fetch of a changed target page — drifted
   modifications re-anchor, unresolvable ones surface as stale rather than vanishing.
10. A failed page load renders a specific, human explanation inside the preview.

---

## 13. Vocabulary

Used consistently in code, UI copy, and the README.

- **AX (Agent Experience)** — how a page presents itself to AI agents, as distinct from to humans.
- **Target page** — the third-party page being edited. Never modified at source; only its representation is. _Avoid_: source page, host page.
- **Modification** — one declarative, type-tagged instruction attached to one **locator**, not to an element — which is why it can outlive the element. Three types: **hide**, **context note** (`context`), **link forwarding** (`forwardLink`).
- **Configuration** — the full set of modifications for one normalized URL. The unit of save, load, and storage.
- **Locator** — the composite pointer identifying an element across re-fetches: path + fingerprint + text hint.
- **Fingerprint** — `sha1(tag + normalized text + href/src)`; content identity, used to re-anchor when the path breaks.
- **ax-id (`data-ax-id`)** — positional, in-session-only handle wiring preview to inspector. Never persisted.
- **Drift** — the path still resolves but the element's content has changed. Applied; for a context note, flagged needs-review.
- **Re-anchor** — the path no longer resolves, but the fingerprint is found elsewhere; the modification moves to the new position.
- **Needs review** — a context note applied to an element whose content changed underneath it. Internal editorial state, never present in the agent payload.
- **Stale modification** — neither path nor fingerprint resolves; skipped at render, surfaced in the UI, kept in the config.
- **Shadowed modification** — valid, but inside a hidden subtree; not rendered, not deleted.
- **Agent payload** — the modified representation served to agents: Markdown blocks by default, cleaned HTML alongside. _Avoid_: agent output, agent-facing representation.
- **Publisher** — the website owner or content manager using the editor. Not a developer. _Avoid_: user, admin.
- **Human view / Agent view / Compare mode** — the three preview states.
- **Provenance marker** — a `data-ax-*` attribute letting a consumer tell publisher annotation from original content.
- **Seam** — where tests attach. There is one: `POST /api/render`.
- **Cold open** — the first-load state showing Agent view: what an agent sees today.

## Appendix A — The assignment, and how it is covered

Build an **AX Editor** — a visual, CMS-style editor (think Elementor or Webflow's inspector
panel) that lets a user edit a webpage, click on any element, and annotate or modify how that
page should appear to AI agents. **The editor is for publishers and website owners, not
developers. Design accordingly.**

**User flow:** open the editor → load a target webpage → the editor renders a preview → click
any element to select it → a click on the selected element exposes modification controls →
apply one or more modifications across the page → save the final configuration.

**Technology:** React, TypeScript.

**Three modification types:**

1. **Hide an element from agents.** Assuming the page is read by an agent, the element must not
   be accessible to it.
2. **Add context to an element.** Attach text that enriches the element for agents — what a
   chart shows, what a CTA or form input does, what a section is about. *Where this lives in
   the output and how an agent would consume it is explicitly part of what is being judged.*
3. **Context-forward a link.** Most agents do not follow links and do not render JavaScript, so
   a good AX follows links on the agent's behalf, server-side. When an `<a>` is selected, fetch
   what the link leads to and show it inline to the agent.

**Judged on:** product thinking · data schema design · code quality · edge case handling ·
finish (does it feel like a real tool or a scaffolded proof of concept).

The assignment is deliberately vague. It states the exercise is testing whether a spec can be
written and then executed, and that anything unclear should be decided, documented, and moved
past.

---

### Coverage

Every line of the assignment, and where it is answered. Nothing in this table may be cut.

### Must have

| # | Requirement | How it is met |
|---|---|---|
| 1 | Two-panel layout: page preview (as served to an agent after modification) + modifications editor | Two panels. The preview has three states — Human view, **Agent view (the default on first load)**, and Compare mode. §7 |
| 2 | Clickable element selection in the preview, clear visual highlight | Sandboxed iframe with an injected overlay; click posts the element back over `postMessage`; selected element carries a distinct outline. §6 |
| 3 | Inspector reflecting the selected element's tag, text content, and current modifications | Inspector shows tag, truncated text, resolved locator, and each modification on that element, individually removable. §7 |
| 4 | Core modification types implemented | All three. §5 |
| 5 | Save button storing the full configuration (format is my decision) | Explicit Save; one JSON config document per normalized URL in SQLite. §4 |
| 6 | Ability to review and remove applied modifications | Global modifications list with per-row removal, plus removal from the inspector. Stale and shadowed states rendered distinctly. §7 |

### Feature requirements

| # | Requirement | How it is met |
|---|---|---|
| F1 | Hide an element — not accessible to the agent | The element **and its subtree are deleted from the agent payload**. Not `display:none`, not `aria-hidden`, not a CSS class — an agent reading raw HTML would still see those. §5.1 |
| F2 | Add context — where it lives and how an agent consumes it | Emitted as a **real, parseable text node adjacent to its element**; in HTML `<span data-ax-context>`, in Markdown an adjacent note. Not an attribute alone, not an HTML comment, not `aria-label` — agents that strip those would lose it. `data-ax-*` markers are layered on for provenance so a consumer can tell publisher annotation from original content. §5.2 |
| F3 | Context-forward a link — fetched server-side, shown inline | Server-side at render time: SSRF-checked, fetched, main content extracted, inlined as a **block** after the anchor's nearest block ancestor so a mid-sentence link does not destroy the sentence. §5.3 |

### Bonus

| # | Bonus | Status |
|---|---|---|
| B1 | Load different URLs, not one hardcoded page | **In.** Any server-rendered public URL, with committed fixtures as a fallback. |
| B2 | Visual diff overlay showing modified elements | **In**, first item of the proof layer (Appendix B, M5). |
| B3 | Impressive, polished UX | **In** — Compare mode with cross-highlighting, breadcrumb ancestor navigation, multi-element selection, typed failure states, publisher-facing copy. |
| B4 | Security (input sanitisation, safe iframe rendering) | **In.** §8 |
| B5 | Automated tests | **In.** §9 |

### Deliverables

| # | Deliverable | Status |
|---|---|---|
| D1 | Source code | The repo. |
| D2 | README: setup and how to run locally including required environment configuration; architecture overview; limitations and future improvements | M6. `npm install && npm run dev` and nothing else; `.env.example` documents the two optional variables. §10 supplies the limitations. |
| D3 | Short screen recording demonstrating the product end to end | M6, seven scripted beats, ~3 min. Appendix B |
| D4 | "You'll likely use AI coding tools. The code you ship should still reflect your judgment and taste." | Every generated file is read and edited before commit. No dead code, no defensive scaffolding nobody asked for, no comments restating the line below them, consistent naming from §13. Domain logic is framework-free so it reads as ours rather than as Nest boilerplate. The **commit history is part of the deliverable**: atomic commits, each a working state, messages saying why rather than what, the test-first sequence visible in the log — it is the only evidence of process that survives into the repo. |
| D5 | Anything unclear: decide, document, move on | Every ambiguity is decided and recorded — §11 collects them, and the README repeats them. |

---

## Appendix B — Delivery plan

Ordered by dependency, not calendar. Each is a **vertical slice that demos on its own** — never
a half-built layer. If the clock stops anywhere after M2, what exists is still a coherent tool.

- **M0 · Foundation** — workspaces, `packages/schema` with zod, Nest scaffold, Vite app, root
  `npm run dev`. Demo pages verified and snapshotted as fixtures.
- **M1 · See what an agent sees** — SSRF guard, fetcher, sanitizer, `<base>` + ax-ids, Markdown
  block emitter and HTML emitter, Agent view as the first-load default, typed failure states.
  *Paste a URL, get the agent payload. No editing yet, and already interesting.*
- **M2 · Hide one element end to end** — locator builder, graded resolver, URL normalization,
  iframe preview with selection, inspector, `hide`, Human/Agent toggle. *The core loop works.*
- **M3 · All three modification types** — `context`, `forwardLink` with its cache and bounds,
  conflict and shadowing rules. *Every mandatory requirement is met here.*
- **M4 · Save and restore** — SQLite repository, save with dirty-state indicator and unload
  guard, modifications list with stale/shadowed states, auto-apply on load with a toast.
  **Multi-element selection lands here, and is not cuttable** — the assignment's "element/s"
  wording reads as a requirement (§11). It waits until the modification types are proven, so
  selection-array complexity is not carried through the transform work for no benefit.
- **M5 · Prove it — all cut candidates, dropped in reverse order:** ① diff overlay ② Compare
  mode with cross-highlighting ③ A/B agent panel ④ breadcrumb navigation ⑤ dev-only
  "simulate page drift" control ⑥ payload word count. **Feature freeze on entering
  M5** — remaining time goes to error and empty states, not new scope.
- **M6 · Ship, no coding** — README · reconcile this brief against what shipped · screen
  recording. Beats: cold open on Agent view → select an element → hide it in Compare mode → add
  context → forward a link → A/B panel → save and restore, closing on one stated limitation.
  Scripted while the app is fresh, shot the next morning; rehearse once, record twice.

**Never cut:** the three modification types, save and restore, the README, the recording.

---
