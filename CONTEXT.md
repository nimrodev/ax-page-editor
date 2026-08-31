# AX Page Editor

Publishers control how their pages are represented to AI agents. The system is a transform from
a target page plus a configuration into an agent payload.

## Language

### The subject

**Target page**:
A third-party web page whose agent representation is being edited. Never altered at source.
_Avoid_: source page, host page

**Publisher**:
The website owner or content manager using the editor. Not a developer.
_Avoid_: user, admin, editor

**Agent payload**:
The representation of a target page delivered to an agent, after modifications are applied.
_Avoid_: agent output, agent-facing representation, rendered output

### What a publisher creates

**Modification**:
One declarative instruction attached to one locator, of exactly one type: hide, context note,
or link forwarding.
_Avoid_: change, edit, annotation, patch

**Configuration**:
The complete set of modifications for one normalized URL. The unit of save, load, and storage.
_Avoid_: config document, modification set, patch set

**Hide**:
A modification removing an element and its descendants from the agent payload.
_Avoid_: exclude, suppress, mask

**Context note**:
A modification attaching publisher-authored text to an element, delivered as readable text in
the agent payload.
_Avoid_: annotation, description, label

**Link forwarding**:
A modification that retrieves what a link points to and places that content in the agent
payload on the agent's behalf.
_Avoid_: link expansion, inlining, crawling

### How a modification finds its element

**Locator**:
The identity a modification is attached to — structural position plus content identity —
resolved against the target page each time the payload is built. A modification targets a
locator, not an element, which is why it can outlive the element.
_Avoid_: selector, target, path

**Fingerprint**:
The content identity within a locator, used to recognise an element whose structural position
has changed.
_Avoid_: hash, signature

**Drift**:
A locator whose structural position still resolves but whose element content has changed.

**Re-anchor**:
A locator whose structural position no longer resolves, but whose fingerprint is found
elsewhere on the page.

**Stale**:
A locator that resolves neither by position nor by fingerprint. The modification is not applied
and not deleted.

**Shadowed**:
A modification whose locator resolves inside a hidden subtree. Not applied, not deleted, and
restored if the ancestor is unhidden.

**Needs review**:
A context note applied to an element whose content has drifted underneath it. Editorial state
belonging to the publisher; never present in the agent payload.
