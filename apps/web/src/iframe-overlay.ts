/**
 * Injected into the preview iframe's srcdoc so the page's own elements
 * become selectable. Runs inside the sandbox (allow-scripts, no
 * allow-same-origin), so it can only talk to the parent via postMessage —
 * it never gets a handle on the host document. The fetched page's own
 * scripts never reach this far; sanitizeDocument already removed them.
 */
export const IFRAME_OVERLAY_SCRIPT = `
<script>
(function () {
  var HIGHLIGHT_OUTLINE = "2px solid #2563eb";
  var selected = null;

  function axIdOf(el) {
    while (el && el !== document.documentElement) {
      var id = el.getAttribute && el.getAttribute("data-ax-id");
      if (id) return { id: id, el: el };
      el = el.parentElement;
    }
    return null;
  }

  document.addEventListener(
    "click",
    function (event) {
      event.preventDefault();
      var match = axIdOf(event.target);
      if (!match) return;

      if (selected) {
        selected.style.outline = "";
        selected.style.outlineOffset = "";
      }
      match.el.style.outline = HIGHLIGHT_OUTLINE;
      match.el.style.outlineOffset = "2px";
      selected = match.el;

      window.parent.postMessage(
        {
          type: "ax:select",
          axId: match.id,
          tag: match.el.tagName.toLowerCase(),
          text: (match.el.textContent || "").trim().slice(0, 300),
        },
        "*",
      );
    },
    true,
  );
})();
</script>
`;
