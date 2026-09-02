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
// One color per modification type (NIM-57), and the single source both
// this overlay and the legend in App.tsx draw from — previously each
// defined its own copy of the same three hex values, which a reviewer
// flagged as exactly the kind of duplication that silently drifts once a
// fourth modification type exists.
export const MODIFICATION_MARK_COLORS: Record<"hide" | "context" | "forwardLink", string> = {
  hide: "#94a3b8",
  context: "#3b82f6",
  forwardLink: "#6366f1",
};

// A solid, neutral color for an element carrying more than one
// modification — a single CSS outline can't show two type colors at
// once, so this replaces both rather than picking one arbitrarily and
// silently hiding the other.
export const SHARED_ELEMENT_MARK_COLOR = "#0f172a";

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

  function describeSelected(el) {
    return {
      axId: el.getAttribute("data-ax-id"),
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || "").trim().slice(0, 300),
      href: el.getAttribute("href"),
      locator: buildLocator(el),
    };
  }

  // The one place "selected" actually leaves this frame — always the
  // full current selection (possibly empty, e.g. after Escape), never a
  // delta, so the parent's own state is a plain mirror rather than
  // something it has to reconcile against what it already had.
  function postSelection() {
    window.parent.postMessage({ type: "ax:select", selections: selected.map(describeSelected) }, "*");
  }

  // Clears highlights on whatever was selected, replaces it with exactly
  // the given elements, and notifies the parent — the one path both a
  // plain click and a programmatic reveal/locate go through, so
  // "selection" never means two different things depending on how it
  // was set.
  function replaceSelection(elements) {
    selected.forEach(clearHighlight);
    selected = elements.slice();
    selected.forEach(setHighlight);
    postSelection();
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

  // One outline color per modification type (NIM-57) — dashed, so it
  // reads as "marked" rather than "selected" (the click/reveal highlight
  // above is solid), except when an element carries more than one
  // modification at once (SHARED_ELEMENT_OUTLINE below): a single CSS
  // outline can only ever show one color, so a second color silently
  // replacing the first would hide that anything is there at all. An
  // outline rather than a border or an overlay div: it never
  // participates in layout (no reflow, no risk of shifting inline text)
  // and never sits on top of the element it marks, so it can never block
  // a click on the content underneath — a real constraint here, not
  // just a style preference.
  var MARK_OUTLINE = {
    hide: "2px dashed ${MODIFICATION_MARK_COLORS.hide}",
    context: "2px dashed ${MODIFICATION_MARK_COLORS.context}",
    forwardLink: "2px dashed ${MODIFICATION_MARK_COLORS.forwardLink}",
  };
  // Solid, not dashed — a visibly different pattern from any single-type
  // mark, so "this element has more than one modification" reads as its
  // own state rather than a slightly-off version of one of the three.
  var SHARED_ELEMENT_OUTLINE = "3px solid ${SHARED_ELEMENT_MARK_COLOR}";
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
      // A mark clears even if this element is also part of the live
      // selection (clearHighlight would otherwise be undone by clearMark,
      // or vice versa) — selected and marked are independent style
      // layers, only one of which this loop owns.
      if (selected.indexOf(el) === -1) clearMark(el);
      else el.removeAttribute("data-ax-mark");
      delete marked[id];
    });

    modifications.forEach(function (modification) {
      var el = resolveLocator(modification.target);
      if (!el) return;
      var outline = modification.sharedElement ? SHARED_ELEMENT_OUTLINE : MARK_OUTLINE[modification.type];
      if (!outline) return;
      el.style.setProperty("outline", outline, "important");
      el.style.setProperty("outline-offset", "2px", "important");
      el.setAttribute("data-ax-mark", modification.sharedElement ? "multiple" : modification.type);
      marked[modification.id] = el;
    });
  }

  // Wikipedia's own collapsed-sidebar links (e.g. its Vector 2022 skin's
  // hamburger drawer) turn out not to use display:none — they set
  // visibility:hidden directly on the link, which still produces a
  // non-empty getClientRects(). Checking only getClientRects() missed
  // exactly the real-world case this exists for, so both signals are
  // checked: an ancestor with display:none (empty rects) and the
  // element's own visibility:hidden/collapse.
  function isRenderedVisible(el) {
    if (el.getClientRects().length === 0) return false;
    var style = window.getComputedStyle(el);
    if (style.visibility === "hidden" || style.visibility === "collapse") return false;
    return true;
  }

  function revealElement(el) {
    // A locate/reveal always replaces the whole selection with just this
    // one element — it's driven by the Review panel or a Markdown
    // block's popover, both single-target flows, not an additive click.
    replaceSelection([el]);
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // scrollIntoView and the outline above both silently no-op on an
    // element that resolves correctly but isn't actually rendered on
    // screen — the parent needs an explicit signal to tell "resolved but
    // invisible" apart from "nothing happened".
    if (!isRenderedVisible(el)) {
      window.parent.postMessage({ type: "ax:reveal-hidden" }, "*");
    }
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

    // Locating an ordinary, never-modified Markdown block (NIM-66): there
    // is no stored Locator for it yet — the agent payload only carries
    // its axId — but that's the same axId this frame's own elements
    // carry (both come from the same assignAxIds pass), so a direct
    // attribute lookup is all resolution this case needs. ax:reveal
    // below stays locator-based for the case that does have one: a
    // modification whose target may have moved since it was applied.
    if (event.data.type === "ax:locate") {
      var byAxId = document.querySelector('[data-ax-id="' + event.data.axId + '"]');
      if (!byAxId) {
        window.parent.postMessage({ type: "ax:reveal-failed" }, "*");
        return;
      }
      revealElement(byAxId);
      return;
    }

    if (event.data.type !== "ax:reveal") return;
    var el = resolveLocator(event.data.locator);
    if (!el) {
      window.parent.postMessage({ type: "ax:reveal-failed" }, "*");
      return;
    }
    revealElement(el);
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

      // NIM-56: a modifier click adds or removes one element from the
      // selection; a plain click replaces the whole selection with just
      // this one, same as before multi-select existed.
      var additive = event.shiftKey || event.metaKey || event.ctrlKey;
      if (!additive) {
        replaceSelection([match.el]);
        return;
      }
      var index = selected.indexOf(match.el);
      if (index === -1) {
        setHighlight(match.el);
        selected.push(match.el);
      } else {
        clearHighlight(match.el);
        selected.splice(index, 1);
      }
      postSelection();
    },
    true,
  );

  // NIM-56: "Escape ... clears it" — the other half of "the selection
  // persists after applying" (a plain click on a *new* element already
  // clears the old selection down to just that one, per the handler
  // above; this covers clearing to nothing without picking anything new).
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") replaceSelection([]);
  });
})();
</script>
`;
