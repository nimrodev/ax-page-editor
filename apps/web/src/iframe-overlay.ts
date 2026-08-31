/**
 * Injected into the preview iframe's srcdoc so the page's own elements
 * become selectable. Runs inside the sandbox (allow-scripts, no
 * allow-same-origin), so it can only talk to the parent via postMessage —
 * it never gets a handle on the host document. The fetched page's own
 * scripts never reach this far; sanitizeDocument already removed them.
 *
 * On click, this also builds a locator (path + fingerprint + textHint)
 * from the live element, using the exact same algorithm as
 * packages/schema/src/locator.ts. A sandboxed srcdoc cannot import that
 * module, so the algorithm is duplicated here in plain JS — keep the two
 * in sync if either changes. Building the locator client-side, at
 * selection time, is what lets a "hide" modification survive the render
 * seam re-fetching and re-parsing the page from scratch (ADR-0001):
 * the server re-verifies this same fingerprint against whatever it gets
 * back, rather than trusting a positional id from this render.
 */
export const IFRAME_OVERLAY_SCRIPT = `
<script>
(function () {
  var HIGHLIGHT_OUTLINE = "2px solid #2563eb";
  var selected = null;
  var TEXT_HINT_MAX_LENGTH = 120;

  function normalizeText(text) {
    return text.replace(/\\s+/g, " ").trim();
  }

  function fnv1a(input) {
    var hash = 0x811c9dc5;
    for (var i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function buildPath(el) {
    var segments = [];
    var current = el;
    while (current) {
      var tag = current.tagName.toLowerCase();
      var siblings = current.parentElement
        ? Array.prototype.filter.call(current.parentElement.children, function (c) {
            return c.tagName === current.tagName;
          })
        : [current];

      if (siblings.length > 1) {
        var index = siblings.indexOf(current) + 1;
        segments.unshift(tag + ":nth-of-type(" + index + ")");
      } else {
        segments.unshift(tag);
      }
      current = current.parentElement;
    }
    return segments.join(">");
  }

  function buildLocator(el) {
    var text = normalizeText(el.textContent || "");
    var href = el.getAttribute("href") || "";
    var src = el.getAttribute("src") || "";
    var tag = el.tagName.toLowerCase();

    return {
      path: buildPath(el),
      fingerprint: fnv1a(tag + "|" + text + "|" + href + "|" + src),
      textHint: text.length > TEXT_HINT_MAX_LENGTH ? text.slice(0, TEXT_HINT_MAX_LENGTH) : text,
    };
  }

  function setHighlight(el) {
    // setProperty(..., "important") rather than the style shorthand: a
    // page's own CSS reset (outline: none !important is common) would
    // otherwise beat a plain inline style, silently defeating the one
    // thing this overlay exists to show.
    el.style.setProperty("outline", HIGHLIGHT_OUTLINE, "important");
    el.style.setProperty("outline-offset", "2px", "important");
  }

  function clearHighlight(el) {
    el.style.removeProperty("outline");
    el.style.removeProperty("outline-offset");
  }

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

      if (selected) clearHighlight(selected);
      setHighlight(match.el);
      selected = match.el;

      window.parent.postMessage(
        {
          type: "ax:select",
          axId: match.id,
          tag: match.el.tagName.toLowerCase(),
          text: (match.el.textContent || "").trim().slice(0, 300),
          locator: buildLocator(match.el),
        },
        "*",
      );
    },
    true,
  );
})();
</script>
`;
