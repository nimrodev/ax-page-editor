# AX Page Editor — Build Plan

Design settled through a full grill; every decision recorded in
[`docs/DECISIONS.md`](docs/DECISIONS.md) (18 ADRs). Vocabulary in
[`docs/GLOSSARY.md`](docs/GLOSSARY.md). Design narrative in [`BRIEF.md`](BRIEF.md).

Linear project: **AX Page Editor** (`NIM`) · Repo: `nimrodev/ax-page-editor` (private)

---

## Working process

**TDD, every task.** Write the failing test first, confirm it fails for the right reason,
implement the minimum that passes, review, commit, push. No task is done until its test is
green and the commit is on `main`.

**Iterative by construction.** The build is cut into seven milestones, each a *vertical slice*
that is demoable on its own. At the end of every milestone there is a working product that
does less — never a half-built layer that does nothing. If the clock runs out at any point
after M2, what exists is still a coherent tool.

**One cut line.** Everything in M5 is a cut candidate, dropped in reverse order. Nothing in
M0–M4 or M6 may be cut.

---

## Architecture in one paragraph

The product is a transform: `(source URL, modification set) -> agent-facing representation`.
The server fetches the target page (SSRF-guarded, honest UA), sanitizes it, injects `<base>`,
and assigns a positional `data-ax-id` to every element. The client renders that into a
sandboxed `<iframe srcdoc>` and captures clicks over `postMessage`. Modifications are stored
as declarative data against a composite locator (structural path + content fingerprint + text
hint) and re-applied on every render, never baked into a saved copy of the page. A second
endpoint returns the agent payload as an ordered array of Markdown blocks plus cleaned HTML.
Hidden elements are **deleted from that payload**, not styled away.

Stack: React + TS + Vite + Tailwind · NestJS (default Express platform) · SQLite behind a
repository interface · zod in `packages/schema` as the single schema definition. Domain logic
(locator, transforms, fetcher, sanitizer) is written as plain classes with no Nest decorators,
so it unit-tests without a testing module.

---

Calendar dates live in the Linear milestones, not here. This document is about **order and
dependencies** — what must be true before the next slice can start. The deadline is real, but
the plan is to finish as early as possible, not to fill the time.

## Milestones

### M0 · Foundation
*Proof: `npm run dev` boots both apps; schema tests green; demo pages verified.*

- Verify demo pages accept the honest UA — **done**: Wikipedia, BBC News, Stripe /pricing pass;
  REI 403s; Vercel /pricing serves ~7.5 KB of text from 1.1 MB of HTML (kept as the cautionary
  example, unusable as a target).
- Snapshot the three working pages as committed HTML fixtures.
- npm workspaces skeleton: `apps/web`, `apps/server`, `packages/schema`.
- `packages/schema`: zod modification schema, config document type, exported TS types.
- Nest scaffold — single feature module, thin controller, zod validation pipe (not
  class-validator, so the schema keeps one definition).
- Vite + React + Tailwind, `/api` proxy; root `npm run dev` runs both.

### M1 · See what an agent sees
*Proof: paste a URL, get the agent payload. No editing yet, and it is already interesting.*

- SSRF guard: scheme allowlist, DNS-resolve, private/loopback/link-local/metadata blocks,
  redirect chain re-checked and capped. Tests first.
- Fetcher: honest `AXEditor/1.0` UA with `AX_USER_AGENT` override, timeout, size cap,
  content-type check. Live/fixture toggle.
- Sanitizer: strip `<script>`, `on*`, `javascript:`, form actions, nested iframes.
- `<base href>` injection + `data-ax-id` assignment.
- Markdown emitter producing `{axId, markdown}[]`; HTML emitter.
- Agent view pane, **default on first load** — the cold open.
- Typed failure states rendered in the pane: blocked by site, timed out, unsupported type,
  blocked for security. Publisher language, no status codes.

### M2 · Hide one element, end to end
*Proof: click a nav block, hide it, watch it leave the agent payload. The core loop works.*

- Locator builder: structural path + `sha1(tag + normalized text + href/src)` + text hint.
- Graded resolver: exact → drift (warn) → re-anchor by fingerprint → stale. Tests first;
  this is the strongest engineering story in the project.
- URL normalization + tests.
- iframe preview, selection overlay, `postMessage` wiring, selection highlight.
- Inspector: tag, truncated text, resolved locator, modifications on the selected element.
- `hide` transform — subtree-inclusive.
- Human / Agent view toggle.

### M3 · All three modification types
*Proof: every mandatory requirement in the assignment is met.*

- `context` transform: real parseable text node adjacent to the element, `data-ax-context` as
  a provenance marker. Never an attribute alone, never an HTML comment, never `aria-label`.
- `forwardLink`: fetch destination, Readability extraction, block-level placement after the
  nearest block ancestor, blockquote in Markdown, dedupe repeated hrefs, ~20k char cap,
  depth 1, cycle/self skip, typed placeholders for non-HTML.
- Forwarded-link cache (Nest interceptor).
- Conflict rules: children of hidden elements are **shadowed, not deleted**; `context` and
  `forwardLink` may coexist on one anchor.

### M4 · Save and restore
*Proof: save, refresh, come back tomorrow — the work is still there.*

- SQLite repository + config document keyed by normalized URL, original URL retained.
- Save button, dirty-state indicator, `beforeunload` guard.
- Modifications list: review, remove, with stale and shadowed states rendered distinctly.
- Auto-apply saved config on load + toast reporting counts including stale.

### M5 · Prove it — **cut candidates, dropped in reverse order**
*Proof: a reviewer can see the modifications worked, not just that they were made.*

1. Diff overlay in Human view, always on — dashed red outline hidden, blue badge context,
   green badge forwarded, plus legend.
2. Compare mode: human left / agent right, cross-highlight by `axId`, strikethrough
   placeholder for the selected hidden element.
3. A/B agent panel: three fixed questions plus free text, before vs after, server-side,
   Sonnet, cached by hash(question + payload), committed fixtures so it runs with no API key.
4. Breadcrumb ancestor navigation + arrow-key parent/child selection.
5. Dev-only "simulate page drift" control, to demonstrate re-anchoring live.
6. Payload word count, split as `−noise · +context · total` — **last, and only if time
   remains.** Real tokenizer is a further upgrade beyond that; token counting is not in the
   assignment's requirements.

**Feature freeze once M5 is entered:** no new scope after this point — remaining time goes to error and empty states, not to more features.

### M6 · Ship
*No coding.*

- README: setup (`npm install && npm run dev`, nothing else), architecture overview,
  limitations, future work — JS-rendered pages via Playwright, robots.txt enforcement,
  Postgres JSONB as system of record with compiled configs at the edge.
- Reconcile `SPEC.md` with what actually shipped (the spec itself is written up front, before M0).
- Screen recording, ~3 min, scripted while the app is fresh and shot the following morning. Beats: cold open on
  Agent view → select an element → hide it in Compare mode → add context → forward a link →
  A/B panel → save and restore, closing on one stated limitation. Rehearse once, record twice.

---

## Testing

Jest on the server (Nest default — no tooling detour), vitest on the web app. Test-first on:
the locator resolver (exact, drift, re-anchor, stale), each modification transform, the
conflict/shadowing rules, URL normalization, and the SSRF guard. One integration test:
URL → render → assert the agent payload. No Playwright e2e; not worth the setup on this clock.

## Known limitations, stated up front

JavaScript-rendered pages are out of scope — the pipeline never executes scripts, so an SPA
yields an empty DOM with nothing to annotate. robots.txt is not enforced. Forwarding is capped
at depth 1. Single-user, single-node, no auth. Each of these is deliberate and belongs in the
README rather than being discovered by the reviewer.
