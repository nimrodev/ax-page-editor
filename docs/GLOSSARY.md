# Glossary — AX Page Editor

Terms used consistently across code, UI copy, and the README.

- **AX (Agent Experience)** — how a page presents itself to AI agents, as distinct from how it presents to humans.
- **Target page** — the third-party webpage being edited. Never modified at source; only its representation is.
- **Modification** — one declarative, type-tagged instruction (`hide` | `context` | `forwardLink`) attached to one element.
- **Configuration / config document** — the full set of modifications for one normalized URL. The unit of save, load, and storage.
- **Locator** — the composite pointer identifying an element across re-fetches: structural path + content fingerprint + text hint.
- **Fingerprint** — `sha1(tag + normalized text + href/src)`; content identity, used to re-anchor when the structural path breaks.
- **ax-id (`data-ax-id`)** — a positional, in-session-only element handle used to wire preview to inspector. Never persisted.
- **Drift** — the structural path no longer resolves but the fingerprint matches elsewhere; the modification re-anchors and is recorded as drifted.
- **Stale modification** — neither path nor fingerprint resolves; skipped at render, surfaced in the UI, retained in the config.
- **Shadowed modification** — valid, but its element sits inside a hidden subtree; not rendered, not deleted.
- **Agent output / agent payload** — the modified representation served to agents, in Markdown (default) or cleaned HTML.
- **Human view / Agent view / Compare mode** — the three preview states: styled page, agent payload, and the two side by side.
- **Context-forwarding** — server-side fetching of a link's destination, inlined into the agent output on the agent's behalf.
- **Cold open** — the first-load state showing Agent view, demonstrating what an agent currently sees.
