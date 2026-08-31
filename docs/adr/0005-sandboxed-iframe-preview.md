# Sandboxed iframe preview

The human-facing preview renders sanitized page HTML into an `<iframe srcdoc>` sandbox that
never combines `allow-scripts` with `allow-same-origin`, with an injected overlay translating
clicks into element selection.

## Considered options

Parsing the page into a JSON tree and rendering it with React gives total control and a clean
selection model, but loses the page's real appearance — and the product is explicitly compared
to Elementor and Webflow, where authoring against the real page is the point. Shadow DOM avoids
postMessage but offers weaker isolation and lets host CSS fight page CSS. Fetching the page in
the browser fails on CORS and would remove the server-side link following the product requires.

## Consequences

Preview and host application communicate over postMessage, so selection state crosses a
boundary. That is the price of a hard security boundary around third-party markup.
