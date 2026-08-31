# Hiding removes content from the payload

"Hidden from agents" is implemented by deleting the element and its descendants from the agent
payload, not by `display:none`, `aria-hidden`, or a CSS class. An agent reading raw HTML still
sees text hidden by any of those, so they would make the feature a lie.

## Consequences

Hiding cannot be done in the browser, which forces the whole server-side render path and is
the reason the architecture has a render endpoint at all. A reader who assumes this could have
been a CSS toggle should read that as deliberate, not as over-engineering.
