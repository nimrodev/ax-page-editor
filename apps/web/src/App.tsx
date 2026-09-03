import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Locator, Modification } from "@ax/schema";
import { AgentPayload, RenderFailure, loadConfiguration, renderPage, saveConfiguration } from "./api";
import { failureMessage } from "./failure-messages";
import { HumanPreview, Selection } from "./HumanPreview";
import { Inspector } from "./Inspector";
import { AgentPayloadView } from "./AgentPayloadView";
import { relativeTime } from "./relative-time";
import { buildResolutionSummary, buildReviewEntries, ReviewPanel } from "./ReviewPanel";
import { MODIFICATION_MARK_COLORS, SHARED_ELEMENT_MARK_COLOR } from "./iframe-overlay";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; url: string; payload: AgentPayload };

/**
 * A modification's id is derived from its (type, target path) rather than
 * generated fresh each time, so re-applying to the same element is
 * naturally an upsert on the client too — matching the server's own
 * dedupeModifications, which enforces the same rule at the render seam
 * regardless of what a client sends.
 */
function modificationId(type: string, path: string): string {
  return `${type}:${path}`;
}

/**
 * JSON.stringify with object keys sorted at every level, so two
 * structurally-identical objects always serialize identically regardless
 * of the order their keys were assigned in. Plain JSON.stringify is
 * insensitive to *this* — a modification built client-side as
 * `{ id, type, target, value }` and the same modification round-tripped
 * through the server's zod schema (which reconstructs objects in
 * schema-declared field order) are equal in every way that matters, but
 * would otherwise serialize to two different strings and register as a
 * phantom "unsaved change" forever.
 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * A stable, order-independent fingerprint of a modification list — used
 * to tell "unsaved changes" apart from "the same set of modifications,
 * just accumulated (or returned by the server) in a different order"
 * (NIM-53). Sorting by id first means two lists containing the same
 * modifications always compare equal regardless of sequence; stableStringify
 * then does the same for each modification's own keys.
 */
export function serializeModifications(modifications: Modification[]): string {
  return stableStringify([...modifications].sort((a, b) => a.id.localeCompare(b.id)));
}

/**
 * NIM-56: "Where one selected element contains another, hiding skips the
 * descendant, since the ancestor's subtree already covers it." A
 * locator's path is the full root-down tag chain (locator.ts's
 * buildPath), so element B is a descendant of element A if and only if
 * B's path is exactly A's path followed by ">" and more segments — the
 * ">" boundary is what stops "section" from falsely matching a sibling
 * like "sectionX" that merely shares a string prefix. Ancestry is
 * checkable from the path strings alone; no real DOM is needed, which is
 * what makes this a pure, unit-testable function despite selection
 * itself living in the sandboxed iframe.
 */
export function filterDescendants(selections: Selection[]): Selection[] {
  return selections.filter(
    (candidate) =>
      !selections.some(
        (other) => other !== candidate && candidate.locator.path.startsWith(`${other.locator.path}>`),
      ),
  );
}

export default function App() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [format, setFormat] = useState<"markdown" | "html">("markdown");
  const [view, setView] = useState<"agent" | "human">("human");
  // Switching to Human view (a click, or a Review panel reveal) updates
  // content that can be well below the current scroll position — without
  // this, "look, it changed" happens entirely off-screen and reads as
  // "nothing happened".
  const humanViewRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (view === "human") humanViewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [view]);
  const [humanViewRequested, setHumanViewRequested] = useState(false);
  // Always the full current selection (NIM-56) — empty, one, or several
  // elements. A single Selection | null was the whole model before
  // multi-select; every consumer below now takes an array, even the ones
  // that only ever act on exactly one (a locate/reveal round trip).
  const [selections, setSelections] = useState<Selection[]>([]);
  const [modifications, setModifications] = useState<Modification[]>([]);
  // What's actually on disk for this page, as of the last save or load —
  // the baseline "unsaved changes" is measured against. Starts as an
  // empty list rather than null: a page with nothing saved yet is a
  // legitimate "nothing to be unsaved from" state, not a pending unknown.
  const [savedModifications, setSavedModifications] = useState<Modification[]>([]);
  const [loadedInfo, setLoadedInfo] = useState<{ count: number; updatedAt: string } | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [revealRequest, setRevealRequest] = useState<{ locator: Locator; token: number } | null>(null);
  const [locateRequest, setLocateRequest] = useState<{ axId: string; token: number } | null>(null);
  // Set by clicking "Hide" in a Markdown block's popover (NIM-66), before
  // the real element is even found — Hide needs a full Locator, which a
  // never-modified block doesn't carry, only an axId. Locating resolves
  // the live element and (via the normal ax:select round trip) hands
  // back a real Selection; handleSelect below applies the hide the
  // instant one arrives whose axId matches what was asked for, so a
  // publisher never sees an extra "now click Hide again" step.
  const [pendingHideAxId, setPendingHideAxId] = useState<string | null>(null);
  // Same idea as pendingHideAxId, but for "Add context" — there's nothing
  // to auto-apply (a note needs typed text), so this just focuses the
  // Inspector's textarea once the real Selection arrives, rather than
  // leaving the publisher to notice and click into it themselves after
  // already saying they wanted to type one.
  const [pendingContextAxId, setPendingContextAxId] = useState<string | null>(null);
  const [contextFocusToken, setContextFocusToken] = useState(0);
  const isDirty = serializeModifications(modifications) !== serializeModifications(savedModifications);

  // NIM-56: descendants are filtered out first — "where one selected
  // element contains another, hiding skips the descendant, since the
  // ancestor's subtree already covers it" — then each remaining target
  // gets its own hide modification via the same upsert every single-hide
  // used, just repeated. Upserting (rather than toggling) is what makes
  // "applying to a selection where some already carry it affects only
  // the rest, with no error and no toggling-off" true for free: an
  // already-hidden target's upsert just re-sets the same value.
  const handleHide = useCallback((targets: Selection[]) => {
    const kept = filterDescendants(targets);
    setModifications((prev) => {
      let next = prev;
      for (const target of kept) {
        const id = modificationId("hide", target.locator.path);
        next = [...next.filter((m) => m.id !== id), { id, type: "hide", target: target.locator }];
      }
      return next;
    });
  }, []);

  const handleSelect = useCallback(
    (next: Selection[]) => {
      setSelections(next);
      // The pending-hide/pending-context flows below are single-target
      // by construction (a Markdown block's popover locates exactly one
      // axId) — guarding on next.length === 1 keeps a modifier-click
      // selection from accidentally matching a stale pending id.
      const [only] = next;
      if (next.length !== 1 || !only) return;
      setPendingHideAxId((pending) => {
        if (pending === only.axId) {
          handleHide([only]);
          return null;
        }
        return pending;
      });
      setPendingContextAxId((pending) => {
        if (pending === only.axId) {
          setContextFocusToken((t) => t + 1);
          return null;
        }
        return pending;
      });
    },
    [handleHide],
  );

  // Reviewing a modification from the review list (NIM-55) should behave
  // like reviewing it any other way: switch to the view that actually
  // shows it, and let the reveal round-trip through the iframe drive
  // Inspector's selection the same way a click would.
  const handleReveal = useCallback((modification: Modification) => {
    setView("human");
    setHumanViewRequested(true);
    setRevealRequest({ locator: modification.target, token: Date.now() });
  }, []);

  // Clicking a Markdown block's popover (NIM-66): "Locate on page" and
  // "Add context" switch to Human view — the publisher explicitly asked
  // to see the page, or needs the Inspector's textarea, which only
  // renders alongside Human view. Resolving the axId into a real Locator
  // still requires HumanPreview's iframe to be mounted (setHumanViewRequested
  // below), but mounted isn't the same as visible — see the "stays mounted"
  // comment by HumanPreview's render below.
  const handleLocateBlock = useCallback((axId: string) => {
    setView("human");
    setHumanViewRequested(true);
    setLocateRequest({ axId, token: Date.now() });
  }, []);

  // Hide has nothing for the publisher to look at — it's applied the
  // instant the resolved Selection comes back (handleSelect above), fully
  // automatically — so unlike Locate/Add-context it only needs the iframe
  // mounted to resolve the axId, not switched into view. Reported by the
  // publisher as an unwanted view jump: they asked to hide something from
  // the Agent view and didn't expect to be dropped onto a page with
  // "nothing to see" as a result.
  const handleHideBlock = useCallback((axId: string) => {
    setPendingHideAxId(axId);
    setHumanViewRequested(true);
    setLocateRequest({ axId, token: Date.now() });
  }, []);

  const handleAddContextBlock = useCallback(
    (axId: string) => {
      setPendingContextAxId(axId);
      handleLocateBlock(axId);
    },
    [handleLocateBlock],
  );

  // NIM-56: "one text field, storing the same text as a separate
  // modification per element, each individually editable afterwards" —
  // no descendant filtering here (unlike hide): a context note on a
  // container and one on something inside it are both meaningful at
  // once, so there's no "already covered" case to skip.
  const handleSetContext = useCallback((targets: Selection[], text: string) => {
    setModifications((prev) => {
      let next = prev;
      for (const target of targets) {
        const id = modificationId("context", target.locator.path);
        next = [...next.filter((m) => m.id !== id), { id, type: "context", target: target.locator, value: { text } }];
      }
      return next;
    });
  }, []);

  const handleForwardLink = useCallback((targets: Selection[]) => {
    setModifications((prev) => {
      let next = prev;
      for (const target of targets) {
        const href = target.href;
        if (!href) continue;
        const id = modificationId("forwardLink", target.locator.path);
        next = [...next.filter((m) => m.id !== id), { id, type: "forwardLink", target: target.locator, value: { href } }];
      }
      return next;
    });
  }, []);

  const handleRemove = useCallback((id: string) => {
    setModifications((prev) => prev.filter((m) => m.id !== id));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    // Loading a different page abandons the current one's in-progress
    // edits just as surely as closing the tab does — the beforeunload
    // guard below can't see this navigation at all, since the document
    // never actually unloads.
    if (isDirty && !window.confirm("You have unsaved changes on this page. Load a new page anyway?")) {
      return;
    }

    const submittedUrl = url.trim();
    setState({ status: "loading" });
    setView("human");
    setHumanViewRequested(true);
    setSelections([]);
    setModifications([]);
    setSavedModifications([]);
    setLoadedInfo(null);
    setSaveStatus("idle");
    try {
      const payload = await renderPage(submittedUrl);
      setState({ status: "ready", url: submittedUrl, payload });

      const saved = await loadConfiguration(submittedUrl);
      if (saved && saved.modifications.length > 0) {
        setModifications(saved.modifications);
        setSavedModifications(saved.modifications);
        setLoadedInfo({ count: saved.modifications.length, updatedAt: saved.updatedAt });
      }
    } catch (err) {
      const message =
        err instanceof RenderFailure ? failureMessage(err.reason) : failureMessage("unknown");
      setState({ status: "error", message });
    }
  }

  async function handleSave() {
    if (state.status !== "ready") return;
    setSaveStatus("saving");
    try {
      const saved = await saveConfiguration(state.url, modifications);
      setSavedModifications(saved.modifications);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }

  // Covers an actual tab close/refresh/navigation-away — the in-app "load
  // a different page" path above is a separate guard, since swapping
  // `url` state never fires this event at all.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Re-renders the agent payload whenever the modification list changes,
  // so hiding something in Human view is reflected in Agent view without
  // a separate "apply" step. The render seam is stateless and re-fetches
  // fresh each time (ADR-0001), so this is a normal render call, not a
  // save.
  const readyUrl = state.status === "ready" ? state.url : null;
  useEffect(() => {
    if (!readyUrl) return;
    let cancelled = false;

    renderPage(readyUrl, modifications)
      .then((payload) => {
        if (!cancelled) setState({ status: "ready", url: readyUrl, payload });
      })
      .catch(() => {
        // A modification-triggered re-render failing (e.g. a transient
        // network blip) leaves the last good payload on screen rather
        // than replacing it with an error, so a flaky re-render can't
        // blank out a page the user already successfully loaded.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyUrl, modifications]);

  function selectView(next: "agent" | "human") {
    setView(next);
    if (next === "human") setHumanViewRequested(true);
  }

  // Shared between ReviewPanel and Human view's own unresolved reminder
  // below — both need the same entries, and computing it twice would risk
  // the two silently disagreeing about what counts as unresolved.
  const reviewEntries = buildReviewEntries(
    modifications,
    state.status === "ready" ? state.payload.modificationStatuses : [],
  );
  const reviewResolutionSummary = buildResolutionSummary(reviewEntries);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-slate-800">AX Page Editor</h1>
        <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/pricing"
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={state.status === "loading"}
          >
            {state.status === "loading" ? "Loading…" : "Load page"}
          </button>
          {state.status === "ready" && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={!isDirty || saveStatus === "saving"}
                className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
              >
                {saveStatus === "saving" ? "Saving…" : "Save"}
              </button>
              <span className="text-xs text-slate-500">
                {isDirty
                  ? "Unsaved changes"
                  : saveStatus === "saved"
                    ? "Saved"
                    : saveStatus === "error"
                      ? "Couldn't save — try again"
                      : null}
              </span>
            </div>
          )}
        </form>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-8">
        {state.status === "idle" && (
          <p className="text-slate-500">
            Enter a URL above to see what an AI agent reads from that page today.
          </p>
        )}

        {state.status === "error" && (
          <div className="rounded border border-amber-300 bg-amber-50 p-4 text-amber-900">
            {state.message}
          </div>
        )}

        {state.status === "ready" && (
          <div>
            {loadedInfo && (
              <div className="mb-3 flex items-center justify-between rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                <span>
                  Loaded {loadedInfo.count} saved {loadedInfo.count === 1 ? "modification" : "modifications"}, saved{" "}
                  {relativeTime(loadedInfo.updatedAt)}.
                </span>
                <button onClick={() => setLoadedInfo(null)} aria-label="Dismiss" className="text-blue-600 hover:underline">
                  Dismiss
                </button>
              </div>
            )}
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-slate-500">
                {view === "agent" ? "This is what an AI agent sees today." : "The page as it actually looks."}
              </p>
              <div className="flex gap-1 text-sm">
                <button
                  onClick={() => selectView("agent")}
                  className={`rounded px-3 py-1 ${view === "agent" ? "bg-slate-800 text-white" : "text-slate-600"}`}
                >
                  Agent view
                </button>
                <button
                  onClick={() => selectView("human")}
                  className={`rounded px-3 py-1 ${view === "human" ? "bg-slate-800 text-white" : "text-slate-600"}`}
                >
                  Human view
                </button>
              </div>
            </div>

            <div style={{ display: view === "agent" ? "block" : "none" }}>
              <div className="mb-2 flex justify-end gap-1 text-sm">
                <button
                  onClick={() => setFormat("markdown")}
                  className={`rounded px-2 py-1 ${format === "markdown" ? "bg-slate-800 text-white" : "text-slate-600"}`}
                >
                  Markdown
                </button>
                <button
                  onClick={() => setFormat("html")}
                  className={`rounded px-2 py-1 ${format === "html" ? "bg-slate-800 text-white" : "text-slate-600"}`}
                >
                  HTML
                </button>
              </div>
              <AgentPayloadView
                payload={state.payload}
                format={format}
                modifications={modifications}
                view={view}
                onLocateBlock={handleLocateBlock}
                onHideBlock={handleHideBlock}
                onAddContextBlock={handleAddContextBlock}
                onRemoveModification={handleRemove}
              />
            </div>

            {/*
              Once requested, HumanPreview stays mounted for the rest of
              this page's session — switching views toggles CSS display,
              never mount/unmount. The click highlight is applied as a live
              DOM style inside the iframe, not tracked in React state, so
              it only survives a view switch because the iframe's document
              is never torn down. Conditionally rendering this on `view`
              instead of `humanViewRequested` would silently break
              "selection survives switching views".
            */}
            {humanViewRequested && (
              <div ref={humanViewRef} style={{ display: view === "human" ? "flex" : "none" }} className="gap-4">
                <div className="flex-1">
                  {/*
                    Agent view's ModificationNavigator pill always surfaces
                    its unresolved count, impossible to miss — Human view had
                    no equivalent, so a publisher who'd only seen that pill
                    could switch tabs and find nothing telling them the same
                    modifications were still unresolved here. Unlike
                    ReviewPanel's own banner below, this isn't gated on the
                    "broad failure" threshold: it exists specifically for the
                    smaller counts that threshold is designed to stay quiet
                    about, so the two don't just duplicate each other.
                  */}
                  {reviewResolutionSummary.unresolvedCount > 0 && (
                    <p className="mb-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                      {reviewResolutionSummary.unresolvedCount} of {reviewResolutionSummary.total} modifications
                      couldn't be matched to this page — see the list below.
                    </p>
                  )}
                  <div className="mb-2 flex items-center gap-4 text-xs text-slate-500">
                    <span className="font-medium text-slate-600">Marked on the page:</span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-3 w-3 rounded-sm border-2 border-dashed"
                        style={{ borderColor: MODIFICATION_MARK_COLORS.hide }}
                      />
                      Hidden from agents
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-3 w-3 rounded-sm border-2 border-dashed"
                        style={{ borderColor: MODIFICATION_MARK_COLORS.context }}
                      />
                      Context note
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-3 w-3 rounded-sm border-2 border-dashed"
                        style={{ borderColor: MODIFICATION_MARK_COLORS.forwardLink }}
                      />
                      Forwarded link
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-3 w-3 rounded-sm border-2"
                        style={{ borderColor: SHARED_ELEMENT_MARK_COLOR }}
                      />
                      Multiple modifications
                    </span>
                  </div>
                  <HumanPreview
                    url={state.url}
                    onSelect={handleSelect}
                    revealRequest={revealRequest}
                    locateRequest={locateRequest}
                    modifications={modifications}
                  />
                </div>
                <div className="flex shrink-0 flex-col gap-4">
                  <Inspector
                    selections={selections}
                    modifications={modifications}
                    modificationStatuses={state.status === "ready" ? state.payload.modificationStatuses : []}
                    onHide={handleHide}
                    onRemove={handleRemove}
                    onSetContext={handleSetContext}
                    onForwardLink={handleForwardLink}
                    focusContextRequest={contextFocusToken}
                  />
                  <ReviewPanel entries={reviewEntries} onReveal={handleReveal} onRemove={handleRemove} />
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
