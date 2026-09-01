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

  function postSelect(el) {
    window.parent.postMessage(
      {
        type: "ax:select",
        axId: el.getAttribute("data-ax-id"),
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || "").trim().slice(0, 300),
        href: el.getAttribute("href"),
        locator: buildLocator(el),
      },
      "*",
    );
  }

  // Mirrors resolve-locator.ts's exact-tier check (path resolves AND the
  // live fingerprint still matches) — this is the one place the review
  // list (NIM-55) can turn a stored Locator back into a real element to
  // reveal, since the parent has no DOM access into this sandboxed frame.
  function resolveLocator(locator) {
    var candidate;
    try {
      candidate = document.querySelector(locator.path);
    } catch (e) {
      return null;
    }
    if (!candidate) return null;
    if (buildLocator(candidate).fingerprint !== locator.fingerprint) return null;
    return candidate;
  }

  // One outline color per modification type (NIM-57) — dashed, always,
  // so it reads as "marked" rather than "selected" (the click/reveal
  // highlight above is solid). An outline rather than a border or an
  // overlay div: it never participates in layout (no reflow, no risk of
  // shifting inline text) and never sits on top of the element it marks,
  // so it can never block a click on the content underneath — a real
  // constraint here, not just a style preference.
  var MARK_OUTLINE = {
    hide: "2px dashed #94a3b8",
    context: "2px dashed #3b82f6",
    forwardLink: "2px dashed #6366f1",
  };
  var marked = {}; // modificationId -> element currently marked for it

  function clearMark(el) {
    el.style.removeProperty("outline");
    el.style.removeProperty("outline-offset");
    el.removeAttribute("data-ax-mark");
  }

  // Replaces the whole marked set on every call rather than diffing
  // against the previous one — modifications can be added, removed, or
  // re-anchor to a different element between calls, and re-resolving
  // everything from scratch is the only way that's never stale.
  function applyMarks(modifications) {
    Object.keys(marked).forEach(function (id) {
      var el = marked[id];
      // A mark clears even if this element is also the live selection
      // (clearHighlight would otherwise be undone by clearMark, or vice
      // versa) — selected and marked are independent style layers, only
      // one of which this loop owns.
      if (el !== selected) clearMark(el);
      else el.removeAttribute("data-ax-mark");
      delete marked[id];
    });

    modifications.forEach(function (modification) {
      var el = resolveLocator(modification.target);
      if (!el) return;
      var outline = MARK_OUTLINE[modification.type];
      if (!outline) return;
      el.style.setProperty("outline", outline, "important");
      el.style.setProperty("outline-offset", "2px", "important");
      el.setAttribute("data-ax-mark", modification.type);
      marked[modification.id] = el;
    });
  }

  // Lets the parent ask this frame to scroll to and highlight a
  // previously-applied modification's element — the reverse direction of
  // the click-to-select flow above, driven by the review list rather
  // than a click inside the frame.
  window.addEventListener("message", function (event) {
    if (!event.data) return;

    if (event.data.type === "ax:mark-modifications") {
      applyMarks(event.data.modifications || []);
      return;
    }

    if (event.data.type !== "ax:reveal") return;
    var el = resolveLocator(event.data.locator);
    if (!el) {
      window.parent.postMessage({ type: "ax:reveal-failed" }, "*");
      return;
    }
    if (selected) clearHighlight(selected);
    setHighlight(el);
    selected = el;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    postSelect(el);
  });

  // The parent has no way to know when this script has finished setting
  // up its listeners — srcdoc content loads asynchronously from its own
  // perspective — so it waits for this ping before sending the first
  // "ax:mark-modifications", rather than racing a fixed delay against an
  // iframe load event that fires before this IIFE necessarily has.
  window.parent.postMessage({ type: "ax:overlay-ready" }, "*");

  document.addEventListener(
    "click",
    function (event) {
      event.preventDefault();
      var match = axIdOf(event.target);
      if (!match) return;

      if (selected) clearHighlight(selected);
      setHighlight(match.el);
      selected = match.el;
      postSelect(match.el);
    },
    true,
  );
})();
</script>
`;
